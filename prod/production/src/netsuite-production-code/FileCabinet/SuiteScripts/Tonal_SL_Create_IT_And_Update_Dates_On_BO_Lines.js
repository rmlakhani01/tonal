/**
 *@NApiVersion 2.1
*@NScriptType Suitelet
*/
/*************************************************************
 * File Header
 * Script Type : Suitelet Script
 * Script Name : Tonal SL Create IT And Update Dates On BO Lines
 * File Name   : Tonal_SL_Create_IT_And_Update_Dates_On_BO_Lines.js
 * Description : This script is used for creation of IT and update dates on Bulk SO Lines with IT details after 
 * error fixed by user interaction
 * Created On  : 02/02/2023
 * Modification Details:  
 * Version     Instance          By              Date              Description
 * V1          SB1               Vikash          23/03/2023        modification for When 1 or 2 columns do not have "Data Conversion", the Suitelet should allow reprocessing for the inventory transfer types without "Data Conversion" populated on the File Names.
 * V2          SB1               Vikash          24/03/2023        modifictaion for the saved search for render the data on sublist
 * V3          SB2               Vikash          03/10/2023        modification for the removing of IT creation for the insatallation process. We are going to create IF for the insatallation date
 ************************************************************/
define(
    [
        "N/search",
        "N/record",
        "N/runtime",
        "N/url",
        "N/task",
        "N/redirect",
        "N/ui/serverWidget"
    ], function(search,record,runtime,url,task,redirect,serverWidget) {

    function onRequest(context) {
        try {
            var objScriptParams = context.request.parameters;
            var scriptObj = runtime.getCurrentScript();
            var idScript = scriptObj.getParameter("custscript_client_script_id_mmerp"); //client script id
            if(context.request.method === 'GET'){

                log.debug("Satrted Governance Units: " , scriptObj.getRemainingUsage());

                var form = serverWidget.createForm({
                    title: 'Mid Mile Error Reprocess'
                });

                form.clientScriptFileId = idScript;

                //filter group
                var filterGrp = form.addFieldGroup({
                    id: 'custpage_fieldgrp_filter',
                    label: 'Filters'
                });

                //form date
                var fromDateFieldObj = form.addField({
                    id: 'custpage_mm_er_start_date',
                    label: 'Creation From Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_fromdate){
                    fromDateFieldObj.defaultValue = objScriptParams.custparam_fromdate;
                }

                //to date
                var toDateFieldObj = form.addField({
                    id: 'custpage_mm_er_to_date',
                    label: 'Creation To Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_todate){
                    toDateFieldObj.defaultValue = objScriptParams.custparam_todate;
                }

                //bo parent
                var parentFieldObj = form.addField({
                    id: 'custpage_mm_er_parent',
                    label: 'Bulk Order',
                    type: serverWidget.FieldType.SELECT,
                    container: 'custpage_fieldgrp_filter',
                    source:'customrecord_bulk_sales_order'
                });
                if(objScriptParams.custparam_bulkorder){
                    parentFieldObj.defaultValue = objScriptParams.custparam_bulkorder;
                }

                //bo parent
                var parentFieldObjWidldSearch = form.addField({
                    id: 'custpage_mm_er_parent_wild_search',
                    label: 'Bulk Order Search',
                    type: serverWidget.FieldType.TEXT,
                    container: 'custpage_fieldgrp_filter',
                });
                if(objScriptParams.custparam_bulkorderwild){
                    parentFieldObjWidldSearch.defaultValue = objScriptParams.custparam_bulkorderwild;
                }

                //add sublist
                var sublistObj = addSublist(form);

                //add filter button
                form.addButton({
                    id: 'custpage_filter_button',
                    label: 'Search',
                    functionName: 'searchData()'
                });

                //add refresh button
                form.addButton({
                    id: 'custpage_refresh_button',
                    label: 'Refresh',
                    functionName: 'refresh()'
                });

                //add submit button
                form.addSubmitButton({
                    label: 'Process'
                });

                //set sublist value
                if(objScriptParams.custparam_fromdate || objScriptParams.custparam_todate 
                    || objScriptParams.custparam_bulkorder || objScriptParams.custparam_bulkorderwild){
                    setSublistData(sublistObj,objScriptParams.custparam_fromdate,objScriptParams.custparam_todate,objScriptParams.custparam_bulkorder,objScriptParams.custparam_bulkorderwild);
                }
                else{
                    setSublistData(sublistObj,'','','');
                }

                log.debug("Remaing Governance Units: " , scriptObj.getRemainingUsage());
                context.response.writePage(form);
            }

            if(context.request.method === 'POST'){
                var fromDate = context.request.parameters.custpage_mm_er_start_date;
                var toDate = context.request.parameters.custpage_mm_er_to_date;
                var bulkOrder = context.request.parameters.custpage_mm_er_parent;

                log.debug('fromDate=='+fromDate+'||toDate=='+toDate,'bulkOrder=='+bulkOrder);

                //get the selected customer details
                var lineCount = context.request.getLineCount({
                    group: 'custpage_mm_er_sublist'
                });

                log.debug('post-linecount',lineCount);

                var bulksoLineDetails = [];
                var tempData = [];
                var arrObj = [];
                for(var x = 0 ; x < lineCount ; x++){
                    arrObj = [];
                    var selected = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_select', line:x});
                    if(selected == 'T' || selected == true){
                        var name = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_name', line:x});
                        var boLineRecId = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_boline_record_id', line:x});
                        var soParent = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_so_parent_id', line:x});  
                        var item = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_item_id', line:x});
                        var releasedQty = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_released_qty', line:x});
                        var shippedQty = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_shipped_qty', line:x});
                        var receivedQty = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_received_qty', line:x});
                        var deliveredQty = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_delivered_qty', line:x});
                        var installedQty = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_installed_qty', line:x});
                        var bulkOrderRecId = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_parent_id', line:x});
                        var rIt = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_rit', line:x});
                        var dIt = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_dit', line:x});
                        var iIt = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_iit', line:x});
                        var errorMessage = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_error_message', line:x});
                        var ditDate = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_ditdate', line:x});
                        var ritDate = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_ritdate', line:x});
                        var iitDate = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_iitdate', line:x});
                        var dfn = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_delivery_filename', line:x});
                        var rfn = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_receipt_filename', line:x});
                        var ifn = context.request.getSublistValue({group:'custpage_mm_er_sublist', name:'custpage_sublist_install_filename', line:x});
                        bulksoLineDetails.push({
                            name:name,
                            bo_so_line_rec_id:boLineRecId,
                            so_parent:soParent,
                            item:item,
                            realesed_qty:releasedQty,
                            shipped_qty:shippedQty,
                            received_qty:receivedQty,
                            delivered_qty:deliveredQty,
                            installed_qty:installedQty,
                            bulk_order_rec_id:bulkOrderRecId,
                            r_it:rIt,
                            d_it:dIt,
                            i_it:iIt,
                            error_message:errorMessage,
                            d_date:ditDate,
                            r_date:ritDate,
                            i_date:iitDate,
                            dfn:dfn,
                            rfn:rfn,
                            ifn:ifn
                        });

                        var index = tempData.findIndex(function (obj){
                            return obj.bulk_order_rec_id == bulkOrderRecId;
                        });

                        var obj1 = {
                            name:name,
                            bo_so_line_rec_id:boLineRecId,
                            so_parent:soParent,
                            item:item,
                            realesed_qty:releasedQty,
                            shipped_qty:shippedQty,
                            received_qty:receivedQty,
                            delivered_qty:deliveredQty,
                            installed_qty:installedQty,
                            r_it:rIt,
                            d_it:dIt,
                            i_it:iIt,
                            error_message:errorMessage,
                            d_date:ditDate,
                            r_date:ritDate,
                            i_date:iitDate,
                            dfn:dfn,
                            rfn:rfn,
                            ifn:ifn
                        };

                        //if data not avilable in tempData create one object and push inside array
                        if(index == -1){
                            
                            arrObj.push(obj1);
                            var obj = {
                                bulk_order_rec_id:bulkOrderRecId,
                                data: arrObj
                            };
                            
                            tempData.push(obj);
                        }

                        //if avilable just append with the details to the po
                        else{
                            tempData[index].data.push(obj1);
                        }
                    }
                }

                // log.debug('post-bulksoLineDetails',bulksoLineDetails);
                log.debug('post-tempData=='+tempData.length,tempData);
                // return;

                if(tempData.length > 0){
                    //invoke map reduce for email send
                    var mrTask = task.create({taskType: task.TaskType.MAP_REDUCE});
                    mrTask.scriptId = 'customscript_tnl_mr_reprocess_mm';
                    // mrTask.deploymentId = '';
                    mrTask.params = {
                        'custscript_mm_reprocess_data':tempData
                    }
                    var mrTaskId = mrTask.submit();

                    log.debug('mrTaskId',mrTaskId);

                    //redirect the suitelet
                    redirect.toSuitelet({
                        scriptId: 'customscript_tnl_sl_create_it_update_bsl',
                        deploymentId: 'customdeploy_tnl_sl_create_it_update_bsl',
                    });
                }

            }
        } catch (error) {
            log.error('Main Exception',error);
            context.response.write(JSON.stringify(error));
        }
    }

    //function to add sublist and their fields
    function addSublist(form){
        try {
            //add sublist to show the data
            var sublistObj = form.addSublist({
                id: 'custpage_mm_er_sublist',
                label: 'Re Process',
                type: serverWidget.SublistType.LIST
            });

            //add markall 
            sublistObj.addMarkAllButtons();

            sublistObj.addField({
                id: 'custpage_sublist_select',
                label: 'Reprocess',
                type: serverWidget.FieldType.CHECKBOX
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.ENTRY});

            //parent 
            sublistObj.addField({
                id: 'custpage_sublist_parent',
                label: 'Bulk Order',
                type: serverWidget.FieldType.TEXT
            });

            //parent id
            sublistObj.addField({
                id: 'custpage_sublist_parent_id',
                label: 'Bulk Order',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //name
            sublistObj.addField({
                id: 'custpage_sublist_name',
                label: 'Name',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //record internalid
            sublistObj.addField({
                id: 'custpage_sublist_boline_record_id',
                label: 'Record Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //so parent
            sublistObj.addField({
                id: 'custpage_sublist_so_parent',
                label: 'So Parent',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});;

            //so parent id
            sublistObj.addField({
                id: 'custpage_sublist_so_parent_id',
                label: 'So Parent Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //item
            sublistObj.addField({
                id: 'custpage_sublist_item',
                label: 'Item',
                type: serverWidget.FieldType.TEXT
            });

            //item id
            sublistObj.addField({
                id: 'custpage_sublist_item_id',
                label: 'Item Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //released qty
            sublistObj.addField({
                id: 'custpage_sublist_released_qty',
                label: 'Released Qty',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //shipped qty
            sublistObj.addField({
                id: 'custpage_sublist_shipped_qty',
                label: 'Shipped Quantity',
                type: serverWidget.FieldType.TEXT
            });

            //delivery qty
            sublistObj.addField({
                id: 'custpage_sublist_delivered_qty',
                label: 'Delivery Quantity',
                type: serverWidget.FieldType.TEXT
            });

            //received qunatity
            sublistObj.addField({
                id: 'custpage_sublist_received_qty',
                label: 'Receipt Quantity',
                type: serverWidget.FieldType.TEXT
            });

            //installed qty
            sublistObj.addField({
                id: 'custpage_sublist_installed_qty',
                label: 'Installed Quantity',
                type: serverWidget.FieldType.TEXT
            });

            /* //parent 
            sublistObj.addField({
                id: 'custpage_sublist_parent',
                label: 'Bulk Order',
                type: serverWidget.FieldType.TEXT
            });

            //parent id
            sublistObj.addField({
                id: 'custpage_sublist_parent_id',
                label: 'Bulk Order',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN}); */

            //error message
            sublistObj.addField({
                id: 'custpage_sublist_error_message',
                label: 'Error Message',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //delivery date
            sublistObj.addField({
                id: 'custpage_sublist_ditdate',
                label: 'Delivery Date',
                type: serverWidget.FieldType.TEXT
            });

            //receipt data
            sublistObj.addField({
                id: 'custpage_sublist_ritdate',
                label: 'Receipt Date',
                type: serverWidget.FieldType.TEXT
            });

            //installation date
            sublistObj.addField({
                id: 'custpage_sublist_iitdate',
                label: 'Installation Date',
                type: serverWidget.FieldType.TEXT
            });

            //deliverd it
            sublistObj.addField({
                id: 'custpage_sublist_dit',
                label: 'Delivered IT',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            sublistObj.addField({
                id: 'custpage_sublist_dits',
                label: 'Delivery IT',
                type: serverWidget.FieldType.TEXT
            })

            //receipt it
            sublistObj.addField({
                id: 'custpage_sublist_rit',
                label: 'Received IT',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            sublistObj.addField({
                id: 'custpage_sublist_rits',
                label: 'Receipt IT',
                type: serverWidget.FieldType.TEXT
            })

            //installed it
            sublistObj.addField({
                id: 'custpage_sublist_iit',
                label: 'Installed IF'/* 'Installed IT' */,
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            sublistObj.addField({
                id: 'custpage_sublist_iits',
                label: 'Installed IF'/* 'Installed IT' */,
                type: serverWidget.FieldType.TEXT
            });

            //creation date
            sublistObj.addField({
                id: 'custpage_sublist_creation_date',
                label: 'Creation Date',
                type: serverWidget.FieldType.TEXT
            });

            //error message
            sublistObj.addField({
                id: 'custpage_sublist_error_messages',
                label: 'Error Message',
                type: serverWidget.FieldType.TEXT
            });

            //file name(D)
            sublistObj.addField({
                id: 'custpage_sublist_delivery_filename',
                label: 'Delivery File Name',
                type: serverWidget.FieldType.TEXT
            });

            //file name(R)
            sublistObj.addField({
                id: 'custpage_sublist_receipt_filename',
                label: 'Receipt File Name',
                type: serverWidget.FieldType.TEXT
            });

            //file name(I)
            sublistObj.addField({
                id: 'custpage_sublist_install_filename',
                label: 'Install File Name',
                type: serverWidget.FieldType.TEXT
            });

            return sublistObj;
        } catch (error) {
            log.error('Error : In Add Sublist',error);
        }
    }

    //function to set the sublist value
    function setSublistData(sublistObj,fromDate,toDate,bulkOrder,bulkOrderWild){
        try {
            //get the search data based on applied filters
            var filterArray = [];
        
            filterArray.push(["isinactive","is","F"]);
            filterArray.push("AND"); 
            filterArray.push(["created","onorafter","01/31/2024 12:00 am"]);
            filterArray.push("AND");
            /* filterArray.push([["custrecord_bo_so_line_delivery_date","isnotempty",""],"OR",["custrecord_bo_so_line_receipt_date","isnotempty",""],"OR",["custrecord_bo_so_line_installation_date","isnotempty",""]]);
            filterArray.push("AND");
            filterArray.push([["custrecord_bo_so_line_delivery_inv_trans","anyof","@NONE@"],"OR",["custrecord_bo_so_line_receipt_inv_trans","anyof","@NONE@"],"OR",["custrecord_bo_so_line_install_inv_trans","anyof","@NONE@"]]);     
            // filterArray.push("AND"); 
            // filterArray.push(["custrecord_bo_so_line_error_msg","isnotempty",""]);

            filterArray.push("AND");
            filterArray.push([["custrecord_bo_so_line_delivery_file_name","doesnotcontain","Data Conversion"],"OR",["custrecord_bo_so_line_receipt_file_name","doesnotcontain","Data Conversion"],"OR",["custrecord_bo_so_line_install_file_name","doesnotcontain","Data Conversion"]]) */

            filterArray.push([
                [
                    ["custrecord_bo_so_line_delivery_date","isnotempty",""],
                    "AND",
                    ["custrecord_bo_so_line_delivery_inv_trans","anyof","@NONE@"],
                    "AND",
                    ["custrecord_bo_so_line_delivery_file_name","doesnotcontain","Data Conversion"]
                ],
                "OR",
                [
                    ["custrecord_bo_so_line_receipt_date","isnotempty",""],
                    "AND",
                    ["custrecord_bo_so_line_receipt_inv_trans","anyof","@NONE@"],
                    "AND",
                    ["custrecord_bo_so_line_receipt_file_name","doesnotstartwith","Data Conversion"]
                ],
                "OR",
                [
                    ["custrecord_bo_so_line_installation_date","isnotempty",""],
                    "AND",
                    ["custrecord_bo_so_line_install_if","anyof","@NONE@"],// ["custrecord_bo_so_line_install_inv_trans","anyof","@NONE@"],
                    "AND",
                    ["custrecord_bo_so_line_install_file_name","doesnotcontain","Data Conversion"]
                ]
            ]);
            
            if(bulkOrder){
                filterArray.push("AND"); 
                filterArray.push(["custrecord_bo_so_line_parent","anyof",bulkOrder]);
            }
            if(bulkOrderWild){
                filterArray.push("AND"); 
                filterArray.push(["name","contains",bulkOrderWild]);
            }
            if(fromDate && toDate){
                filterArray.push("AND");
                filterArray.push(["created","within",[fromDate,toDate]]);
            }

            // log.debug('filterArray==',JSON.stringify(filterArray));
            
            var customrecord_bulk_order_so_linesSearchObj = search.create({
                type: "customrecord_bulk_order_so_lines",
                filters:filterArray,
                columns:[
                    
                    search.createColumn({name: "name", label: "Name"}),
                    search.createColumn({name: "custrecord_bo_so_line_so_parent", label: "SO Parent"}),
                    search.createColumn({name: "custrecord_bo_so_line_num", label: "Order Line #"}),
                    search.createColumn({name: "custrecord_bo_so_line_item", label: "Item"}),
                    search.createColumn({name: "custrecord_bo_so_line_serial_num", label: "Serial Number"}),
                    search.createColumn({name: "custrecord_bo_so_line_released_qty", label: "Released Qty"}),
                    search.createColumn({name: "custrecord_bo_so_line_ship_date", label: "Ship Date"}),
                    search.createColumn({name: "custrecord_bo_so_line_delivery_date", label: "Delivery Date"}),
                    search.createColumn({name: "custrecord_bo_so_line_receipt_date", label: "Receipt Date"}),
                    search.createColumn({name: "custrecord_bo_so_line_installation_date", label: "Installation Date"}),
                    search.createColumn({name: "custrecord_bo_so_line_shipped_qty", label: "Shipped Qty"}),
                    search.createColumn({name: "custrecord_bo_so_line_received_qty", label: "Received Qty"}),
                    search.createColumn({name: "custrecord_bo_so_line_delivered_qty", label: "Delivered Qty"}),
                    search.createColumn({name: "custrecord_bo_so_line_installed_qty", label: "Installed Qty"}),
                    search.createColumn({name: "custrecord_bo_so_line_ship_inv_trans", label: "Ship Inventory Transfer"}),
                    search.createColumn({name: "custrecord_bo_so_line_delivery_inv_trans", label: "Delivery Inventory Transfer"}),
                    search.createColumn({name: "custrecord_bo_so_line_receipt_inv_trans", label: "Receipt Inventory Transfer"}),
                    search.createColumn({name: "custrecord_bo_so_line_install_if", label: "Installation Item Fulfilment"}),// search.createColumn({name: "custrecord_bo_so_line_install_inv_trans", label: "Installation Inventory Transfer"}),
                    search.createColumn({name: "custrecord_bo_so_line_ship_file_name", label: "Ship File Name"}),
                    search.createColumn({name: "custrecord_bo_so_line_delivery_file_name", label: "Delivery File Name"}),
                    search.createColumn({name: "custrecord_bo_so_line_receipt_file_name", label: "Receipt File Name"}),
                    search.createColumn({name: "custrecord_bo_so_line_install_file_name", label: "Installation File Name"}),
                    search.createColumn({name: "custrecord_bo_so_line_status_dynamic", label: "Line Status (Dynamic)"}),
                    search.createColumn({name: "custrecord_bo_so_line_status_descr_man", label: "Line Status Description (Manual)"}),
                    search.createColumn({name: "custrecord_bo_so_line_error_msg", label: "SO Line Error Message"}),
                    search.createColumn({name: "custrecord_bo_so_line_parent", label: "Parent"}),   
                    search.createColumn({name: "created", label: "Date Created"})  
                ]
            });
            var searchResultCount = customrecord_bulk_order_so_linesSearchObj .runPaged().count;
            log.debug("Reprocess result count",searchResultCount);
            /*
                The logic to display SO Lines to the Suitelet should be:

                - Date is available,  
                - Qty can be determined either by deriving from the shipped qty or the released qty.
                - No inventory already exists for the type, i.e. not generating dup errors. 

                If one of the condition is not met, the Suitelet will not be helpful for users to reprocess the lines for inventory transfer creations. 
            */
            var arrObj = [],parentRecId = [];
            customrecord_bulk_order_so_linesSearchObj.run().each(function(result){
                var flag = false,dit = true,rit = true, iit = true; 
                var name = result.getValue('name');
                var boLineRecId = result.id;
                var soParent = result.getValue('custrecord_bo_so_line_so_parent');  
                var item = result.getValue('custrecord_bo_so_line_item');
                var itemName = result.getText('custrecord_bo_so_line_item');
                var releasedQty = Number(result.getValue('custrecord_bo_so_line_released_qty'));
                var shippedQty = Number(result.getValue('custrecord_bo_so_line_shipped_qty'));
                var receivedQty = Number(result.getValue('custrecord_bo_so_line_received_qty'));
                var deliveredQty = Number(result.getValue('custrecord_bo_so_line_delivered_qty'));
                var installedQty = Number(result.getValue('custrecord_bo_so_line_installed_qty'));
                var bulkOrderRecId = result.getValue('custrecord_bo_so_line_parent');
                var bulkOrderRecIdText = result.getText('custrecord_bo_so_line_parent');
                var rIt = result.getValue('custrecord_bo_so_line_receipt_inv_trans');
                var rItText = result.getText('custrecord_bo_so_line_receipt_inv_trans');
                var dIt = result.getValue('custrecord_bo_so_line_delivery_inv_trans');
                var dItText = result.getText('custrecord_bo_so_line_delivery_inv_trans');
                var iIt = result.getValue('custrecord_bo_so_line_install_if');//result.getValue('custrecord_bo_so_line_install_inv_trans');
                var iItText = result.getText('custrecord_bo_so_line_install_if');//result.getText('custrecord_bo_so_line_install_inv_trans');
                var errorMessage = result.getValue('custrecord_bo_so_line_error_msg');
                var ditDate = result.getValue('custrecord_bo_so_line_delivery_date')/* ?result.getValue('custrecord_bo_so_line_delivery_date'):'-NA-'; */
                var ritDate = result.getValue('custrecord_bo_so_line_receipt_date')/* ?result.getValue('custrecord_bo_so_line_receipt_date'):'-NA-'; */
                var iitDate = result.getValue('custrecord_bo_so_line_installation_date')/* ?result.getValue('custrecord_bo_so_line_installation_date'):'-NA-'; */
                var creationDate = result.getValue('created');
                var dfn = result.getValue('custrecord_bo_so_line_delivery_file_name');
                var rfn = result.getValue('custrecord_bo_so_line_receipt_file_name');
                var ifn = result.getValue('custrecord_bo_so_line_install_file_name');

                /* if(ditDate != '-NA-' && ritDate != '-NA-' && iitDate != '-NA-'){
                    if(shippedQty > 0){
                        flag = true;
                    }
                    else if(releasedQty > 0){
                        flag = true
                    }
                    if(flag == true){
                        var obj1 = {
                            name:name,
                            bo_so_line_rec_id:boLineRecId,
                            so_parent:soParent,
                            item:item,
                            item_name:itemName,
                            realesed_qty:releasedQty,
                            shipped_qty:shippedQty,
                            received_qty:receivedQty,
                            delivered_qty:deliveredQty,
                            installed_qty:installedQty,
                            r_it:rIt,
                            r_it_text:rItText,
                            d_it:dIt,
                            d_it_text:dItText,
                            i_it:iIt,
                            i_it_text:iItText,
                            error_message:errorMessage,
                            d_date:ditDate,
                            r_date:ritDate,
                            i_date:iitDate,
                            creation_date:creationDate,
                            bulk_order_rec_id_text:bulkOrderRecIdText,
                            bulk_order_rec_id:bulkOrderRecId
                        };
                        arrObj.push(obj1);
                    }
                }
                else{   
                    var index = parentRecId.findIndex(function (i){
                        return i == bulkOrderRecId;
                    });
                    if(index == -1){
                        parentRecId.push(bulkOrderRecId);
                    }
                } */

                /*
                *Modified
                */
                if(ditDate && !dIt){
                    dit = false;
                }
                if(ritDate && !rIt){
                    rit = false;
                }
                if(iitDate && !iIt){
                    iit = false
                }
                
                //check if dit,rit,iit is false for the creation of IT
                if(dit == false || rit == false || iit == false){
                    if(shippedQty > 0){
                        flag = true;
                    }
                    else if(releasedQty > 0){
                        flag = true
                    }
                    if(flag == true){
                        var obj1 = {
                            name:name,
                            bo_so_line_rec_id:boLineRecId,
                            so_parent:soParent,
                            item:item,
                            item_name:itemName,
                            realesed_qty:releasedQty,
                            shipped_qty:shippedQty,
                            received_qty:receivedQty,
                            delivered_qty:deliveredQty,
                            installed_qty:installedQty,
                            r_it:rIt,
                            r_it_text:rItText,
                            d_it:dIt,
                            d_it_text:dItText,
                            i_it:iIt,
                            i_it_text:iItText,
                            error_message:errorMessage,
                            d_date:ditDate,
                            r_date:ritDate,
                            i_date:iitDate,
                            creation_date:creationDate,
                            bulk_order_rec_id_text:bulkOrderRecIdText,
                            bulk_order_rec_id:bulkOrderRecId,
                            dfn:dfn,
                            rfn:rfn,
                            ifn:ifn
                        };
                        arrObj.push(obj1);
                    }
                }
                else{   
                    var index = parentRecId.findIndex(function (i){
                        return i == bulkOrderRecId;
                    });
                    if(index == -1){
                        parentRecId.push(bulkOrderRecId);
                    }
                } 

                return true;
            });

            log.debug('parentRecId=='+parentRecId.length,parentRecId);
            log.debug('arrObj=='+arrObj.length,arrObj);

            //compare with the parentRecordId array and arryObj if bulk_order_rec_id found continue else show on sublsist
            for(var lineNumber = 0 ; lineNumber < arrObj.length ; lineNumber++){
                var index = parentRecId.indexOf(arrObj[lineNumber].bulk_order_rec_id);
                if(index == -1){
                    //name
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_name',
                        line: lineNumber,
                        value: '<a href="'+url.resolveRecord({recordType: 'customrecord_bulk_order_so_lines',recordId: arrObj[lineNumber].bo_so_line_rec_id,isEditMode: false})+'">'+arrObj[lineNumber].name+'</a>'
                    });

                    //record internalid
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_boline_record_id',
                        line: lineNumber,
                        value: arrObj[lineNumber].bo_so_line_rec_id
                    });

                    //so parent
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_so_parent',
                        line: lineNumber,
                        value: '<a href="'+url.resolveRecord({recordType: 'salesorder',recordId: arrObj[lineNumber].so_parent,isEditMode: false})+'">'+arrObj[lineNumber].so_parent+'</a>'
                    });

                    //so parent id
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_so_parent_id',
                        line: lineNumber,
                        value: arrObj[lineNumber].so_parent?arrObj[lineNumber].so_parent:'-NA-'
                    });

                    //item
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_item',
                        line: lineNumber,
                        value: arrObj[lineNumber].item_name
                    });

                    //item internalid
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_item_id',
                        line: lineNumber,
                        value: arrObj[lineNumber].item
                    });

                    //released qty
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_released_qty',
                        line: lineNumber,
                        value: arrObj[lineNumber].realesed_qty?arrObj[lineNumber].realesed_qty:0
                    });

                    //shipped qty
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_shipped_qty',
                        line: lineNumber,
                        value: arrObj[lineNumber].shipped_qty?arrObj[lineNumber].shipped_qty:0
                    });

                    //received qunatity
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_received_qty',
                        line: lineNumber,
                        value: arrObj[lineNumber].received_qty?arrObj[lineNumber].received_qty:0
                    });

                    //delivery qty
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_delivered_qty',
                        line: lineNumber,
                        value: arrObj[lineNumber].delivered_qty?arrObj[lineNumber].delivered_qty:0
                    });

                    //installed qty
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_installed_qty',
                        line: lineNumber,
                        value: arrObj[lineNumber].installed_qty?arrObj[lineNumber].installed_qty:0
                    });

                    //parent 
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_parent',
                        line: lineNumber,
                        value: arrObj[lineNumber].bulk_order_rec_id?'<a href="'+url.resolveRecord({recordType: 'customrecord_bulk_sales_order',recordId: arrObj[lineNumber].bulk_order_rec_id,isEditMode: false})+'">'+arrObj[lineNumber].name+'</a>':'-NA-'
                    });

                    //parent id
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_parent_id',
                        line: lineNumber,
                        value:  arrObj[lineNumber].bulk_order_rec_id
                    });

                    var eMessage = '';
                    if(arrObj[lineNumber].error_message){
                        eMessage = ((JSON.stringify(arrObj[lineNumber].error_message)).length) > 300;
                        eMessage = JSON.stringify(arrObj[lineNumber].error_message).substring(0,299);
                    }
                    //error message
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_error_message',
                        line: lineNumber,
                        value: eMessage?eMessage:'-NA-'
                    });

                    //delivered IT
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_dit',
                        line: lineNumber,
                        value: arrObj[lineNumber].d_it?arrObj[lineNumber].d_it:'-NA-'
                    });

                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_dits',
                        line: lineNumber,
                        value: arrObj[lineNumber].d_it?'<a href="'+url.resolveRecord({recordType: 'inventorytransfer',recordId: arrObj[lineNumber].d_it,isEditMode: false})+'">'+arrObj[lineNumber].d_it_text+'</a>':'-NA-'
                    });

                    //received IT
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_rit',
                        line: lineNumber,
                        value: arrObj[lineNumber].r_it?arrObj[lineNumber].r_it:'-NA-'
                    });

                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_rits',
                        line: lineNumber,
                        value: arrObj[lineNumber].r_it?'<a href="'+url.resolveRecord({recordType: 'inventorytransfer',recordId: arrObj[lineNumber].r_it,isEditMode: false})+'">'+arrObj[lineNumber].r_it_text+'</a>':'-NA-'
                    });

                    //installed IT
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_iit',
                        line: lineNumber,
                        value: arrObj[lineNumber].i_it?arrObj[lineNumber].i_it:'-NA-'
                    });

                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_iits',
                        line: lineNumber,
                        value: arrObj[lineNumber].i_it?'<a href="'+url.resolveRecord({recordType: 'inventorytransfer',recordId: arrObj[lineNumber].i_it,isEditMode: false})+'">'+arrObj[lineNumber].i_it_text+'</a>':'-NA-'
                    });

                    //delivery date
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_ditdate',
                        line: lineNumber,
                        value: arrObj[lineNumber].d_date?arrObj[lineNumber].d_date:'-NA-'
                    });

                    //receipt date
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_ritdate',
                        line: lineNumber,
                        value: arrObj[lineNumber].r_date?arrObj[lineNumber].r_date:'-NA-'
                    });

                    //installation date
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_iitdate',
                        line: lineNumber,
                        value: arrObj[lineNumber].i_date?arrObj[lineNumber].i_date:'-NA-'
                    });

                    //creation date
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_creation_date',
                        line: lineNumber,
                        value:  arrObj[lineNumber].creation_date?arrObj[lineNumber].creation_date:'-NA-'
                    });

                    //error message show
                    var eMessage1 = '';
                    if(arrObj[lineNumber].error_message){
                        eMessage1 = JSON.parse(arrObj[lineNumber].error_message).message;
                    }
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_error_messages',
                        line: lineNumber,
                        value: eMessage1?eMessage1:'-NA-'
                    });

                    //filename(D)
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_delivery_filename',
                        line: lineNumber,
                        value: arrObj[lineNumber].dfn?arrObj[lineNumber].dfn:'-NA-'
                    });

                    //filename(R)
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_receipt_filename',
                        line: lineNumber,
                        value: arrObj[lineNumber].rfn?arrObj[lineNumber].rfn:'-NA-'
                    });

                    //filename(I)
                    sublistObj.setSublistValue({
                        id: 'custpage_sublist_install_filename',
                        line: lineNumber,
                        value: arrObj[lineNumber].ifn?arrObj[lineNumber].ifn:'-NA-'
                    });
                }
            }            
            
        } catch (error) {
            log.error('Error : In Set Sublist Data',error);
        }
    }

    return {
        onRequest: onRequest
    }
});