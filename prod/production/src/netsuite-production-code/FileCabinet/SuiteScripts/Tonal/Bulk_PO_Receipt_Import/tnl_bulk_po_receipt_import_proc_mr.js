/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/render', 'N/runtime', 'N/file', '../Library/moment.min.js'],
function(record, search, render, runtime, file, moment) {
	function getInputData() {
		var repSearch = search.create({
			type: 'customrecord_tnl_bulk_imports',
			filters: [
				['isinactive','is','F'],
				'and',
				['custrecord_tnl_bfi_import_status','is',1], // Only Get Pending
				'and',
				['custrecord_tnl_bfi_import_type','is',2] // Only Get Purchase Order Receipts
			],
			columns: [
				'id',
				'custrecord_tnl_bfi_import_status',
				'custrecord_tnl_bfi_import_file',
				'custrecord_tnl_bfi_error_file',
				'custrecord_tnl_bfi_fulfillment_count',
				'owner',
				search.createColumn({name:'created',sort:search.Sort.DESC})
			]
		}).run().getRange({start: 0, end:1000});

		return repSearch;
	}

	function map(context) {
		log.debug({title:'IMPORT_GEN MAP', details: context});
		try {
			var rec = JSON.parse(context.value);
			var importFile = file.load({id:rec.values.custrecord_tnl_bfi_import_file[0].value});
			var fileData = csvToJSON(importFile.getContents());

			var bolObj = {};
			for (var i = 0; i < fileData.length; i++) {
				if (!fileData[i].container_number) {
					continue;
				}
				if (!bolObj[fileData[i].container_number]) {
					bolObj[fileData[i].container_number] = [];
				}
				bolObj[fileData[i].container_number].push(fileData[i]);
			}

			record.submitFields({
				type:'customrecord_tnl_bulk_imports',
				id: rec.id,
				values: {
					custrecord_tnl_bfi_import_status: 2, // Put In Progress
					custrecord_tnl_bfi_order_count: Object.keys(bolObj).length
				}
			});

			var idx = 1;
			for (var bol in bolObj) {
				context.write({
					key: rec.id + '_' + idx,
					value: bolObj[bol]
				});
				idx++;
			}

		} catch(e) {
			log.error({title:'ERROR MAPPING FILE CONTENTS', details:e.message});
			record.submitFields({type:'customrecord_tnl_bulk_imports', id: rec.id, values: {custrecord_tnl_bfi_import_status: 4}}); // Put In Failed
			return false;
		}
	}

	function reduce(context) {
		log.debug({title:'IMPORT_GEN REDUCE', details: context});
		try {
			var k = context.key.split('_');
			var rec = JSON.parse(context.values[0]);

			var purchaseOrder = rec[0].po_number;
			var tranDate = moment(rec[0].date).toDate();
			var supportDocUrl = rec[0].supporting_documents_url;
			var asnBol = rec[0].asn_bol;
			var portOfOrigin = rec[0].port_of_origin;
			var portOfUnloading = rec[0].port_of_unloading;
			var vesselNumber = rec[0].vessel;
			var carrierName = rec[0].carrier_name;
			var vesselScac = rec[0].vessel_scac;
			var memo = rec[0].memo;

			var locationColl = {
				'ocean': 'IT-Ocean',
				'air': 'IT-Air',
				'fedex': 'IT-Land',
				'land':'IT-Land'
			};

			var location, sku, quantity;
			var hasError = false;
			var locObj = {};

			// Validate Required Fields
			if (!purchaseOrder) {
				rec.error_message = 'Purchase Order Number Missing';
				context.write({key:k[0],value:{success:false, data:rec}});
				return;
			} else {
				purchaseOrder = purchaseOrder.split('-')[0];
			}

			for (var i = 0; i < rec.length; i++) {
				location = rec[i].transport_mode;
				if(location){
					location = location.toLowerCase();
				}
				sku = rec[i].sku;
				quantity = parseFloat(rec[i].quantity);

				if (!location || !locationColl[location]) {
					rec[i].error_message = 'Location Missing';
					hasError = true;
				} else {
					// Get And Swap Location For Id
					if (locObj[location]) {
						if (locObj[location] == -1) {
							rec[i].error_message = 'Location Not Found';
							hasError = true;
						} else {
							rec[i].location = locObj[location];
						}
					} else {
						var locSearch = search.create({
							type: 'location',
							filters: [
								['isinactive', 'is', 'F'],
								'and',
								['name', 'contains', locationColl[location]]
							],
							columns: []
						}).run().getRange({start: 0, end: 1});
						if (!locSearch.length) {
							rec[i].error_message = 'Location Not Found';
							locObj[location] = -1;
							hasError = true;
						} else {
							locObj[location] = locSearch[0].id;
							rec[i].location = locSearch[0].id;
						}
					}
				}

				if (!sku) {
					rec[i].error_message = 'SKU Missing';
					hasError = true;
				}
				if (!quantity) {
					rec[i].error_message = 'Quantity Missing';
					hasError = true;
				}
			}

			if (hasError == true) {
				log.debug({title:'HAS AN ERROR', details: rec});
				context.write({key: k[0], value: {success: false, data: rec}});
				return;
			}

			// Get Purchase Order
			var poSearch = search.create({
				type:'purchaseorder',
				filters: [['tranid','is',purchaseOrder],'and',['mainline','is','T']],
				columns: []
			}).run().getRange({start:0, end:1});

			if (poSearch.length) {
				// Transform To Item Receipt
				var itemReceiptRec = record.transform({
					fromType: 'purchaseorder',
					fromId: poSearch[0].id,
					toType: 'itemreceipt',
					isDynamic: true
				});

				itemReceiptRec.setValue({fieldId:'custbody_tnl_supporting_docs_url',value:supportDocUrl});
				itemReceiptRec.setValue({fieldId:'trandate',value: tranDate});
				itemReceiptRec.setValue({fieldId:'memo',value: memo});

				itemReceiptRec.setText({fieldId:'custbody_tnl_port_of_origin',text: portOfOrigin});
				itemReceiptRec.setText({fieldId:'custbody_tnl_port_of_unloading',text: portOfUnloading});
				itemReceiptRec.setValue({fieldId:'custbody_tnl_vessel_number',value: vesselNumber});
				itemReceiptRec.setValue({fieldId:'custbody_tnl_vessel_scac',value: vesselScac});
				itemReceiptRec.setText({fieldId:'custbody_tnl_carrier',text: carrierName});
				itemReceiptRec.setValue({fieldId:'custbody_tnl_asn_bol',value: asnBol});

				// Loop Lines and Set Location
				var itemReceiptLineCount = itemReceiptRec.getLineCount({sublistId:'item'});
				var linesReceived = [];
				for (var i = 0; i < itemReceiptLineCount; i++) {
					itemReceiptRec.selectLine({sublistId:'item', line:i});
					var lineFound = false;
					var containerNumber = '';
					var trackingSignal = '';
					var toLocation = '';
					var lineNote = '';
					quantity = 0;

					for (var z = 0; z < rec.length; z++) {
						if (linesReceived.indexOf(z) > -1) {
							// This Line Is Already Processed So Just Continue;
							// quantity += parseFloat(rec[z].quantity);
							continue;
						}

						location = rec[z].location;
						sku = rec[z].sku;
						containerNumber = rec[z].container_number;
						trackingSignal = rec[z].tracking_id_number_cargosignal;
						toLocation = rec[z].to_location;
						lineNote = rec[z].notes;

						log.debug({title:'PO Line SKU', details: itemReceiptRec.getCurrentSublistValue({sublistId:'item', fieldId:'itemname'})});
						log.debug({title:'CSV Line SKU', details: sku});
						if (itemReceiptRec.getCurrentSublistValue({sublistId:'item', fieldId:'itemname'}) == sku) {
							lineFound = true;
							quantity += parseFloat(rec[z].quantity);
							linesReceived.push(z);
						}
					}

					if (!lineFound) {
						itemReceiptRec.setCurrentSublistValue({sublistId:'item',fieldId:'itemreceive', value: false});
					} else {
						itemReceiptRec.setCurrentSublistValue({sublistId:'item',fieldId:'itemreceive', value: true});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'location', value: location});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'quantity', value: quantity});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'custcol_tnl_container_number', value: containerNumber});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'custcol_tnl_tracking_id_cargo_signal', value: trackingSignal});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'custcol_tnl_to_location', value: toLocation});
						itemReceiptRec.setCurrentSublistValue({sublistId:'item', fieldId:'custcol_tnl_note', value: lineNote});
					}
					itemReceiptRec.commitLine({sublistId:'item'});
				}

				log.debug({title:'Lines Received', details: linesReceived});

				// Validate All Lines Of Import Were Used
				for (var i = 0; i < rec.length; i++) {
					if (linesReceived.indexOf(i) == -1) {
						rec[i].error_message = 'Line Unable To Be Received';
						hasError = true;
					}
				}
				if (hasError == true) {
					log.debug({title:'HAS AN ERROR', details: rec});
					context.write({key: k[0], value: {success: false, data: rec}});
					return;
				}

				// Save Item Receipt
				try {
					itemReceiptRec.save({ignoreMandatoryFields:true, enableSourcing: true});
					context.write({key:k[0],value:{success:true}});
				} catch(e) {
					log.debug({title:'ERROR SAVING RECEIPT', details:e.message});
					rec = setRecErrors(rec,e.message);
					context.write({key:k[0],value:{success:false, data:rec}});
				}
			} else {
				// No Order So Send Failure
				rec = setRecErrors(rec,'Order Not Found');
				context.write({key:k[0],value:{success:false, data:rec}});
			}
		} catch(e) {
			// Ended Up In Catch For Some Reason So Send Failure
			rec = setRecErrors(rec,e.message);
			context.write({key:k[0],value:{success:false, data:rec}});
			return;
		}
	}

	function setRecErrors(rec, errorMessage) {
		for (var i = 0; i < rec.length; i++) {
			rec[i].error_message = errorMessage;
		}
		return rec;
	}

	function summarize(summary) {
		var retFileObj = {};

		// Loop Summary And Build File Objects
		summary.output.iterator().each(function (key, value) {
			log.audit({
				title: 'Import Generation',
				details: 'key: ' + key + ' / value: ' + value
			});

			// Begin To Build Our Error Files
			if (!retFileObj[key]) {
				retFileObj[key] = {
					success: 0,
					errors: []
				};
			}

			// Check If We Are Good To Go
			var cVal = JSON.parse(value);
			if (cVal.success) {
				retFileObj[key].success++;
			} else {
				retFileObj[key].errors.push(cVal);
			}

			return true;
		});

		log.debug({title:'RET FILE', details: retFileObj});

		// Loop File Obj and Update Processing Records As Needed
		for (var k in retFileObj) {
			try {
				// Load Our Processing Record
				var procRec = record.load({type: 'customrecord_tnl_bulk_imports', id: k});
				var curFulfillCount = parseInt(procRec.getValue({fieldId:'custrecord_tnl_bfi_fulfillment_count'})) || 0;
				curFulfillCount += parseInt(retFileObj[k].success);
				procRec.setValue({fieldId:'custrecord_tnl_bfi_fulfillment_count', value: curFulfillCount});

				// Check For Errors
				if (retFileObj[k].errors.length) {
					procRec.setValue({fieldId:'custrecord_tnl_bfi_import_status', value: 4}); // Failed
					procRec.setValue({fieldId:'custrecord_tnl_bfi_fulfill_err_count', value: retFileObj[k].errors.length});

					// Generate Error File
					var errArray = [];
					for (var i = 0; i < retFileObj[k].errors.length; i++) {
						errArray = errArray.concat(retFileObj[k].errors[i].data);
					}

					log.debug({title:'ERR ARRAY', details: errArray});

					var errDoc = jsonToCSV(errArray);
					var nFile = file.create({
						name: k + '_errors_' + moment().unix() + '.csv',
						fileType: file.Type.CSV,
						contents: errDoc,
						folder: runtime.getCurrentScript().getParameter({name:'custscript_tnl_error_folder_id'})
					});
					var nFileId = nFile.save();
					procRec.setValue({fieldId:'custrecord_tnl_bfi_error_file', value: nFileId});
				} else {
					procRec.setValue({fieldId:'custrecord_tnl_bfi_import_status', value: 3}); // Complete
				}

				procRec.save({ignoreMandatoryFields:true});
			} catch(e) {
				record.submitFields({
					type: 'customrecord_tnl_bulk_imports',
					id: k,
					values: {
						custrecord_tnl_bfi_import_status: 4 // Failed
					}
				});
			}
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
					txt = txt.replace(/[\r"]/g,"");
				}
				tObj[headers[x]] = txt;
			}
			results.push(tObj);
		}

		return results;
	}

	function jsonToCSV(jsonData) {
		var csvDoc = '';
		var jsonKeys = [];
		if (jsonData.length > 0) {
			var curCsvKeyRow = '';
			var curCsvKeyArr = [];
			for (var i = 0; i < jsonData.length; i++) {
				var cKeyRow = Object.keys(jsonData[i]).join(',') + '\n';
				var cKeyArr = Object.keys(jsonData[i]);
				if (cKeyRow != curCsvKeyRow && cKeyRow.length > curCsvKeyRow.length) {
					// There are more keys in the current row so we want to capture them into the Key string and Key Array
					curCsvKeyRow = cKeyRow;
					curCsvKeyArr = cKeyArr;
				}
			}
			csvDoc = curCsvKeyRow;
			jsonKeys = curCsvKeyArr;
		}

		for (var i = 0; i < jsonData.length; i++) {
			for(var z = 0; z < jsonKeys.length; z++) {
				csvDoc += (jsonData[i][jsonKeys[z]] || '') + ','
			}
			csvDoc += '\n';
		}

		return csvDoc
	}

	return {
		getInputData: getInputData,
		map: map,
		reduce: reduce,
		summarize: summarize
	};
});
