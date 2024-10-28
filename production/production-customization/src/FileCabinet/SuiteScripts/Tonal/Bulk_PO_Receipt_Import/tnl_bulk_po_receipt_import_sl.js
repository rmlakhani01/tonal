/**
 * foc_accounting_reports_sl.js
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search', 'N/task', 'N/ui/serverWidget', 'N/ui/message', 'N/redirect', 'N/runtime', '../Library/moment.min.js'],
    function(record, search, task, ui, message, redirect, runtime, moment) {
		function onRequest(context) {
			if (context.request.method == 'GET') {
				checkForPendingImports();
				var form = ui.createForm({
					title:'Bulk PO Receipt Import'
				});

				if (context.request.parameters.tnl_msg) {
					var msgData = JSON.parse(context.request.parameters.tnl_msg);
					form.addPageInitMessage({
						type: msgData.success ? message.Type.CONFIRMATION : message.Type.ERROR,
						title: msgData.success ? 'Import Scheduled' : 'Import Failed To Schedule',
						message: msgData.message
					});
				}

				// Add Fields
				var importFileField = form.addField({
					label: 'PO Receipt File (CSV)',
					type: ui.FieldType.FILE,
					id: 'custpage_tnl_import_file'
				});
				importFileField.isMandatory = true;

				// Add Sublist For Generated Reports
				var genRepSubtab = form.addSubtab({
					id: 'custpage_tnl_imported_files_tab',
					label: 'Imported Files'
				});
				var genRepSublist = form.addSublist({
					label: ' ',
					id: 'custpage_tnl_generated_imports_list',
					type: ui.SublistType.STATICLIST,
					tab: 'custpage_tnl_imported_files_tab'
				});

				genRepSublist.addField({
					label: 'Date/Time',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_created'
				});
				genRepSublist.addField({
					label: 'Imported By',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_imported_by'
				});
				genRepSublist.addField({
					label: 'Status',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_import_status'
				});
                genRepSublist.addField({
                    label: '# Orders',
                    type: ui.FieldType.TEXT,
                    id: 'custpage_tnl_bfi_order_count'
                });
				genRepSublist.addField({
					label: '# Receipts',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_fulfillment_count'
				});
                genRepSublist.addField({
                    label: '# Errors',
                    type: ui.FieldType.TEXT,
                    id: 'custpage_tnl_bfi_fulfill_err_count'
                });
				genRepSublist.addField({
					label: 'Imported File',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_import_file'
				});
				genRepSublist.addField({
					label: 'Error File',
					type: ui.FieldType.TEXT,
					id: 'custpage_tnl_bfi_error_file'
				});

				genRepSublist = populateGenRepSublist(genRepSublist);

				// Add Buttons
				form.addSubmitButton({
					label: 'Import File'
				});
				form.addButton({
					label: 'Back',
					id: 'custpage_etd_back_btn',
					functionName: 'window.history.back(-1)'
				});
                form.addButton({
                    label: 'Refresh',
                    id: 'custpage_etd_reload_btn',
                    functionName: 'window.location.reload()'
                });

				// form.clientScriptModulePath = './etd_inbound_shipment_receipt_client_module.js';

				context.response.writePage({pageObject:form});
			} else {
				var newImportRec = record.create({
					type: 'customrecord_tnl_bulk_imports'
				});
				var params = context.request.parameters;

				log.debug({title: 'PARAMS', details: params});

                // Handle File Upload(s)
                var uplFile = context.request.files['custpage_tnl_import_file'];
                if (uplFile) {
                    var cName = uplFile.name.split('.');
                    uplFile.name = cName[0] + '_' + moment().unix() + '.' + cName[cName.length - 1];
                    uplFile.folder = runtime.getCurrentScript().getParameter({name:'custscript_tnl_po_import_folder_id'});
                    var nFileId = uplFile.save();
                }

				newImportRec.setValue({fieldId:'custrecord_tnl_bfi_import_file', value: nFileId});
				newImportRec.setValue({fieldId:'custrecord_tnl_bfi_import_type', value: 2});

				var curScript = runtime.getCurrentScript();
				try {
					newImportRec.save();
					try {
						var mrTask = task.create({
							taskType: task.TaskType.MAP_REDUCE,
							scriptId: 'customscript_tnl_bulk_porec_proc',
							deploymentId: 'customdeploy_tnl_bulk_porec_proc_1'
						});
						mrTask.submit();
					} catch(e) {

					}
					redirect.toSuitelet({
						scriptId: curScript.id,
						deploymentId: curScript.deploymentId,
						parameters: {
							"tnl_msg": JSON.stringify({success:true, message:'Successfully scheduled import process. See status below!'})
						}
					});
				} catch(e) {
					redirect.toSuitelet({
						scriptId: curScript.id,
						deploymentId: curScript.deploymentId,
						parameters: {
							"tnl_msg": JSON.stringify({success:false, message:'An Error Occurred: ' + e.message})
						}
					});
				}
			}
		}

		function populateGenRepSublist(sublistObj) {
			var repSearch = search.create({
				type: 'customrecord_tnl_bulk_imports',
				filters: [
					['isinactive','is','F'],
					'and',
					['custrecord_tnl_bfi_import_type','is',2] // Only get Purchase Order Receipt
				],
				columns: [
					'id',
					'custrecord_tnl_bfi_import_status',
					'custrecord_tnl_bfi_import_file',
					'custrecord_tnl_bfi_error_file',
                    'custrecord_tnl_bfi_fulfillment_count',
					'custrecord_tnl_bfi_fulfill_err_count',
					'custrecord_tnl_bfi_order_count',
					'owner',
					search.createColumn({name:'created',sort:search.Sort.DESC})
				]
			}).run().getRange({start: 0, end:30});

			log.debug({title:'REP SEARCH RES', details: repSearch});

			for (var i = 0; i < repSearch.length; i++) {
				var importFileLink = repSearch[i].getValue({name:'custrecord_tnl_bfi_import_file'}) ? repSearch[i].getValue({name:'custrecord_tnl_bfi_import_file'}) : null ;
				var errFileLink = repSearch[i].getValue({name:'custrecord_tnl_bfi_error_file'}) ? repSearch[i].getValue({name:'custrecord_tnl_bfi_error_file'}) : null;

				if (importFileLink) {
					importFileLink = '<a href="javascript:void(0)" target="_self" className="dottedlink" onClick="previewMedia(\''+importFileLink+'\', true, true); return false;">'+repSearch[i].getText({name:'custrecord_tnl_bfi_import_file'})+'</a>';
				}

				if (errFileLink) {
					errFileLink = '<a href="javascript:void(0)" target="_self" className="dottedlink" onClick="previewMedia(\''+errFileLink+'\', true, true); return false;">'+repSearch[i].getText({name:'custrecord_tnl_bfi_error_file'})+'</a>';
				}

				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_created', value: repSearch[i].getValue({name:'created'})});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_imported_by', value:repSearch[i].getText({name:'owner'})});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_import_status', value:repSearch[i].getText({name:'custrecord_tnl_bfi_import_status'})});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_import_file', value: importFileLink});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_error_file', value: errFileLink});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_fulfillment_count', value:repSearch[i].getValue({name:'custrecord_tnl_bfi_fulfillment_count'})});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_order_count', value:repSearch[i].getValue({name:'custrecord_tnl_bfi_order_count'})});
				sublistObj.setSublistValue({line:i, id:'custpage_tnl_bfi_fulfill_err_count', value:repSearch[i].getValue({name:'custrecord_tnl_bfi_fulfill_err_count'})});
			}
			return sublistObj;
		}

		function checkForPendingImports() {
			var repSearch = search.create({
				type:'customrecord_tnl_bulk_imports',
				filters: [['isinactive','is','F'],'and',['custrecord_tnl_bfi_import_status','is',1],'and',['custrecord_tnl_bfi_import_type','is',2]],
				columns: []
			}).run().getRange({start:0, end:1});

			if (repSearch.length) {
				try {
					var mrTask = task.create({
						taskType: task.TaskType.MAP_REDUCE,
						scriptId: 'customscript_tnl_bulk_porec_proc',
						deploymentId: 'customdeploy_tnl_bulk_porec_proc_1'
					});
					mrTask.submit();
				} catch (e) {

				}
			}
		}

		return {
			onRequest: onRequest
		}
	}
);
