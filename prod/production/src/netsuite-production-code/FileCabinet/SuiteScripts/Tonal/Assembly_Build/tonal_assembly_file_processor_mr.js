/**
 * tonal_assembly_file_processor_mr.js
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * 
*/
define(['N/search','N/record','N/file','N/task','../Library/moment.min'],
	function(search, record, file, task, moment){
		function getInputData(context) {
			var fileSearch = search.create({
				type: 'file',
				filters: [
					// ['folder','is',408] // Import Pending Folder - SB
					['folder','is',439] // Import Pending Folder - PROD
				],
				columns: []
			}).run().getRange({start:0, end:1});

			var dataArr = [];

			if (fileSearch.length) {
				var csvDoc = file.load({id:fileSearch[0].id});

				// Move File To Processing Folder Immediately -- This Prevents Possibility For Duplicate Processing By Additional Threads
				// csvDoc.folder = 606; // SB
				csvDoc.folder = 436; // PROD
				csvDoc.name = csvDoc.name.split('.')[0] + '_p' + '.csv';
				csvDoc.save();

				var csvData = csvToJSON(csvDoc.getContents());

				// Group By Job Number
				var dataByJob = {};
				for (var i = 0; i < csvData.length; i++) {
					if (!csvData[i].job_no) {
						continue;
					}

					var jobNumber = csvData[i].job_no.trim();
					var componentPart = csvData[i].comp_part.trim();

					// Add To Job Obj If Not Present
					if (!dataByJob[jobNumber]) {
						dataByJob[jobNumber] = {
							job_number: jobNumber,
							file_id: fileSearch[0].id,
							finished_good_item: csvData[i].part_no.trim(),
							make_quantity: csvData[i].qty,
							date: moment(csvData[i].due_date).format('MM/DD/YYYY'),
							components: {}
						}
					}

					// Add Component Obj If Not Present
					if (!dataByJob[jobNumber].components[componentPart]) {
						dataByJob[jobNumber].components[componentPart] = {
							quantity: 0,
							serial_numbers: []
						};
					}

					// Update Component Quantity And Serials
					dataByJob[jobNumber].components[componentPart].quantity += parseFloat(csvData[i].issue_qty);

					// Stubbing Serial For Potential Future Use
					// dataByJob[csvData[i].job_no].components[csvData[i].comp_part].serial_numbers.push(csvData[i].comp_serial);
				}

				log.debug({title:'DATA BY JOB - ' + Object.keys(dataByJob).length, details:dataByJob});

				for (var job in dataByJob) {
					dataArr.push(dataByJob[job]);
				}
			}

			return dataArr;
		}

		function reduce(context) {
			var rec = JSON.parse(context.values[0]);
			log.debug({title:'CUR File', details: rec});

			try {
				// Load CSV For File Handling
				var csvDoc = file.load({id: rec.file_id});

				// Search Work Order
				var workOrderSearch = search.create({
					type: 'workorder',
					filters: [
						['mainline', 'is', 'T'],
						'and',
						['custbody_tonal_extronjn', 'is', rec.job_number],
						'and',
						['status', 'is', 'WorkOrd:B']
					]
				}).run().getRange({start: 0, end: 1});

				if (!workOrderSearch.length) {
					// No Work Order Found - Throw Error
					log.error({title:"INVALID JOB", details:rec.job_number});
					generateError({
						error_message: "INVALID JOB: Work Order " + rec.job_number + " was not found. The Work Order either may not exist or in not in Released status. Please fix and re-process the file.",
						csv_doc: csvDoc
					});
					return false;
				}

				// Transform Work Order To Assembly Build
				var assemblyRec = record.transform({
					fromType: 'workorder',
					fromId: workOrderSearch[0].id,
					toType: 'assemblybuild'
				});

				// Set Header Detail
				assemblyRec.setValue({fieldId: 'trandate', value: moment(rec.date).toDate()});
				assemblyRec.setValue({fieldId: 'quantity', value: rec.make_quantity});

				assemblyRecItems = [];
				// Handle Component Quantities
				var componentCount = assemblyRec.getLineCount({sublistId: 'component'});
				for (var i = 0; i < componentCount; i++) {
					var curLineItem = assemblyRec.getSublistValue({sublistId: 'component', fieldId: 'item', line: i});
					var itemDetail = search.lookupFields({
						type: 'item',
						id: curLineItem,
						columns: ['itemid']
					});

					assemblyRecItems.push(itemDetail.itemid);

					if (!rec.components[itemDetail.itemid]) {
						// Item Not In Import Document - Set To 0
						assemblyRec.setSublistValue({sublistId: 'component', fieldId: 'quantity', value: 0, line: i});
					} else {
						assemblyRec.setSublistValue({sublistId: 'component', fieldId: 'quantity', value: rec.components[itemDetail.itemid].quantity, line: i});
					}
				}

				// Validate There Are No Lines On Import Missing In NetSuite
				log.debug({title:'Assembly Rec Items Arr', details:assemblyRecItems});
				// for (var itm in rec.components) {
				// 	if (assemblyRecItems.indexOf(itm) == -1) {
				// 		log.error({title:"INVALID ITEM", details:itm});
				// 		generateError({
				// 			error_message: "INVALID ITEM: " + itm + " is listed on the import but is not part of the BOM in NetSuite. Please add the item and proper inventory to NetSuite and re-process the file.",
				// 			csv_doc: csvDoc
				// 		});
				// 		return false;
				// 	}
				// }

				try {
					// Save Assembly Build Record
					var newRecId = assemblyRec.save({enableSourcing: true});

					// Attach CSV File To Assembly For Easy Visibility
					record.attach({
						record: {type: 'file', id: rec.file_id},
						to: {type: 'assemblybuild', id: newRecId}
					});

					// Move File To Processed Folder
					// csvDoc.folder = 407; // SB
					csvDoc.folder = 438; // PROD
					csvDoc.name = csvDoc.name.split('.')[0] + '_p' + '.csv';
					csvDoc.save();

					context.write(rec.file_id, 'File Processing Complete');
				} catch (err) {
					log.error({title:'ERROR WHILE SAVING ASSEMBLY BUILD', details:err.message});
					generateError({error_message: "ERROR WHILE SAVING ASSEMBLY BUILD: " + err.message, csv_doc: csvDoc});
					return false;
				}
			} catch(err) {
				log.error({title:'ERROR WHILE BUILDING ASSEMBLY BUILD RECORD', details:err.message});
				generateError({error_message: "ERROR WHILE BUILDING ASSEMBLY BUILD RECORD: " + err.message, csv_doc: csvDoc});
				return false;
			}
		}

		function generateError(obj) {
			// Create Error Record and Attach File
			var errRec = record.create({type: 'customrecord_tnl_assembly_import_err'});
			errRec.setValue({fieldId:'name', value: obj.csv_doc.name + ' FAILED TO IMPORT'});
			errRec.setValue({fieldId:'custrecord_tnl_assembly_import_err_file', value: obj.csv_doc.id});
			errRec.setValue({fieldId:'custrecord_tnl_assembly_import_err_msg', value: obj.error_message});
			errRec.save();

			// Move File To Failed Folder
			var csvDoc = obj.csv_doc;
			// csvDoc.folder = 409; // SB
			csvDoc.folder = 437; // PROD
			csvDoc.name = csvDoc.name.split('.')[0] + '_f' + '.csv';
			csvDoc.save();
		}

		function summarize(summary) {
			summary.output.iterator().each(function (key, value){
				log.audit({
					title: ' summary.output.iterator',
					details: 'key: ' + key + ' / value: ' + value
				});
				return true;
			});

			var fileSearch = search.create({
				type: 'file',
				filters: [
					// ['folder','is',408] // Pending Folder - SB
					['folder','is',439] // Pending Folder - PROD
				],
				columns: []
			}).run().getRange({start:0, end:1});

			if (fileSearch.length) {
				var mrScriptTask = task.create({
					taskType: task.TaskType.MAP_REDUCE,
					scriptId: 'customscript_tnl_assembly_file_proc',
					deploymentId: 'customdeploy_tnl_assembly_file_proc_1',
				});
				mrScriptTask.submit();
			}
		}

		function csvToJSON(csv) {
			var lines = csv.split('\n');
			var results = [];
			var headers = lines[0].split(',');

			for (var i = 0; headers  && i < headers.length; i++) {
				headers[i] = headers[i].trim().replace(/\s/g,"_").replace(/\./,"").toLowerCase();
			}

			for (var i = 1; lines && i < lines.length; i++) {
				var tObj = {};
				var currentLine = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
				for (var x = 0; x < headers.length; x++) {
					var txt  = currentLine[x];
					if (txt) {
						txt = txt.replace(/\r/g,"");
					}
					tObj[headers[x]] = txt;
				}
				results.push(tObj);
			}

			return results;
		}

		return {
			getInputData: getInputData,
			reduce: reduce,
			summarize: summarize
		}
	}
);
