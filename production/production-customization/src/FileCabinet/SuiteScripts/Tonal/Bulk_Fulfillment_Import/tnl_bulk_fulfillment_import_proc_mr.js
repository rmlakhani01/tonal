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
                ['custrecord_tnl_bfi_import_type','is',1] // Only Get Sales Order Fulfillments
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

            record.submitFields({
                type:'customrecord_tnl_bulk_imports',
                id: rec.id,
                values: {
                    custrecord_tnl_bfi_import_status: 2, // Put In Progress
                    custrecord_tnl_bfi_order_count: fileData.length
                }
            });

            for (var i = 0; i < fileData.length; i++) {
                context.write({
                    key: rec.id + '_' + i,
                    value: fileData[i]
                });
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

            var customerOrder = rec.order_id;
            var location = rec.lmh;
            var sku = rec.sku;
            var lmhAddress = rec.lmh_destination || '';
            var fulfillmentDate = rec.actual_install_date ? moment(rec.actual_install_date) : moment();
            var memoValue = rec.memo;

            // Validate Required Fields
            if (!customerOrder) {
                rec.error_message = 'Customer Order Number Missing';
                context.write({key:k[0],value:{success:false, data:rec}});
                return;
            }
            if (!location) {
                rec.error_message = 'Location Missing';
                context.write({key:k[0],value:{success:false, data:rec}});
                return;
            }
            if (!sku) {
                rec.error_message = 'SKU Missing';
                context.write({key:k[0],value:{success:false, data:rec}});
                return;
            }

            // Get Location Data
            var locSearch = search.create({
                type:'location',
                filters: [
                    ['isinactive','is','F'],
                    'and',
                    ['name','contains',location]
                ],
                columns: []
            }).run().getRange({start:0, end:1});

            if (!locSearch.length) {
                rec.error_message = 'Location Not Found';
                context.write({key:k[0],value:{success:false, data:rec}});
                return;
            }

            // Get Sales Order
            var soSearch = search.create({
                type:'salesorder',
                filters: [['otherrefnum','equalto',customerOrder],'and',['mainline','is','T']],
                columns: []
            }).run().getRange({start:0, end:1});

            if (soSearch.length) {
                // Load SO to determine if we need to update the item based upon the SKU
                var soRec = record.load({
                    type:'salesorder',
                    id: soSearch[0].id
                });

                var soLineCount = soRec.getLineCount({sublistId:'item'});
                var lineChanged = false;
                //added by Ali Alnashashibi
                var salesOrderLocation = soRec.getValue({
                    fieldId: 'location'
                });
                // Swap Items On Sales Order As Needed
                // This is very hard-coded for now and can be changed later if needed

                // PRODUCTION
                var itemSwapObjT1 = {
                    50: 1696,
                    1410: 1695,
                    1332: 52,
                    1343: 53,
                }
                var itemSwapObjT800 = {
                    1696: 50,
                    1695: 1410,
                    52: 1332,
                    53: 1343,
                }

                // SB1
                // var itemSwapObjT1 = {
                // 	1724: 52,
                // 	1725: 53
                // }
                // var itemSwapObjT800 = {
                // 	50: 1724,
                // 	52: 1724,
                // 	1713: 1725,
                // 	53: 1725,
                // }

                // SB2
                // var itemSwapObjT1 = {
                // 	1332: 52,
                // 	1343: 53
                // }
                // var itemSwapObjT800 = {
                // 	50: 1332,
                // 	52: 1332,
                // 	1713: 1343,
                // 	53: 1343,
                // }

                for (var i = 0; i < soLineCount; i++) {
                    var cItem = soRec.getSublistValue({sublistId:'item',fieldId:'item',line:i});
                    var curAmount = soRec.getSublistValue({sublistId: 'item', fieldId: 'amount', line: i});
                    var curQuantity = soRec.getSublistValue({sublistId: 'item', fieldId: 'quantity', line: i});
                    var curRate = soRec.getSublistValue({sublistId: 'item', fieldId: 'rate', line: i});

                    // log.debug({title:'CItem', details: cItem});
                    // if ([50,52,53,1332,1343,1410,1695,1696].indexOf(parseInt(cItem)) > -1) {
                    // if ([50,52,53,1713,1724,1725].indexOf(parseInt(cItem)) > -1) {
                    if ([50,52,53,1332,1343,1713].indexOf(parseInt(cItem)) > -1) {
                        // log.debug({title:'Is In Array', details:'IN ARRAY'});
                        if (sku == '100-0001'){
                            // log.debug({title:'SKU is 100-0001', details:sku});
                            // log.debug({title:'Should Swap?', details:itemSwapObjT1.hasOwnProperty(cItem)});
                            if (itemSwapObjT1.hasOwnProperty(cItem)) {
                                log.debug({title:'Swapping Item', details:'Swapping'});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'item', line: i, value: itemSwapObjT1[cItem]});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'quantity', line: i, value: curQuantity});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'rate', line: i, value: curRate});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'amount', line: i, value: curAmount});
                                lineChanged = true;
                            }
                        } else if (sku == '100-0002') {
                            // log.debug({title:'SKU is 100-0002', details:sku});
                            // log.debug({title:'Should Swap?', details:itemSwapObjT800.hasOwnProperty(cItem)});
                            if (itemSwapObjT800.hasOwnProperty(cItem)) {
                                // log.debug({title:'Swapping Item', details:'Swapping'});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'item', line: i, value: itemSwapObjT800[cItem]});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'quantity', line: i, value: curQuantity});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'rate', line: i, value: curRate});
                                soRec.setSublistValue({sublistId: 'item', fieldId: 'amount', line: i, value: curAmount});
                                lineChanged = true;
                            }
                        }
                    }
                }

                // Save SO only if line was changed
                if (lineChanged) {
                    soRec.save({ignoreMandatoryFields: true});
                }

                // Transform To Fulfillment
                var fulfillmentRec = record.transform({
                    fromType: 'salesorder',
                    fromId: soSearch[0].id,
                    toType: 'itemfulfillment',
                    isDynamic: true
                });

                fulfillmentRec.setValue({fieldId:'shipstatus',value:'C'}); // Set To Shipped
                fulfillmentRec.setValue({fieldId:'custbody_tnl_lmh_address',value: lmhAddress});
                fulfillmentRec.setValue({fieldId:'trandate',value: fulfillmentDate.toDate()});
                //added by Ali Alnashashibi
                fulfillmentRec.setValue({fieldId:'custbody_sales_order_location',value: salesOrderLocation}); // Set Sales Order Location for Retail P&L GL Plugin

                if (memoValue) {
                    fulfillmentRec.setValue({fieldId: 'memo', value: memoValue});
                }

                // Loop Lines and Set Location
                var fulfillmentLineCount = fulfillmentRec.getLineCount({sublistId:'item'});
                for (var i = 0; i < fulfillmentLineCount; i++) {
                    fulfillmentRec.selectLine({sublistId:'item', line:i});
                    fulfillmentRec.setCurrentSublistValue({sublistId:'item',fieldId:'itemreceive', value: true});
                    fulfillmentRec.setCurrentSublistValue({sublistId:'item', fieldId:'location', value: locSearch[0].id});
                    fulfillmentRec.setCurrentSublistValue({sublistId:'item', fieldId:'quantity', value: fulfillmentRec.getCurrentSublistValue({sublistId:'item', fieldId:'quantityremaining'})});
                    fulfillmentRec.commitLine({sublistId:'item'});
                }

                // Save Fulfillment
                try {
                    fulfillmentRec.save({ignoreMandatoryFields:true});
                    context.write({key:k[0],value:{success:true}});
                } catch(e) {
                    rec.error_message = e.message;
                    context.write({key:k[0],value:{success:false, data:rec}});
                }
            } else {
                // No Order So Send Failure
                rec.error_message = 'Order Not Found';
                context.write({key:k[0],value:{success:false, data:rec}});
            }
        } catch(e) {
            // Ended Up In Catch For Some Reason So Send Failure
            rec.error_message = e.message;
            context.write({key:k[0],value:{success:false, data:rec}});
            return;
        }
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
                        errArray.push(retFileObj[k].errors[i].data);
                    }

                    log.debug({title:'ERR ARRAY', details: errArray});

                    var errDoc = jsonToCSV(errArray);
                    var nFile = file.create({
                        name: k + '_errors_' + moment().unix() + '.csv',
                        fileType: file.Type.CSV,
                        contents: errDoc,
                        // folder: 783
                        folder: runtime.getCurrentScript().getParameter({name:'custscript_tnl_error_bfi_folder_id'}) //SB2
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
            csvDoc = Object.keys(jsonData[0]).join(',') + '\n';
            jsonKeys = Object.keys(jsonData[0])
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