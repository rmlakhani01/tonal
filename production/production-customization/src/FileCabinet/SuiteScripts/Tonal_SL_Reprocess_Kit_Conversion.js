/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
/*************************************************************
 * File Header
 * Script Type : Suitelet Script
 * Script Name : Tonal SL Reprocess Kit Conversion
 * File Name   : Tonal_SL_Reprocess_Kit_Conversion.js
 * Description : This script is used for create work order and assembly build for the kit conversion by taking the 
 * data fromm tha Work Order Staging Table with status partial and fail
 * Created On  : 26/12/2022
 * Modification Details:  
 ************************************************************/
define(
    [
        "N/search",
        "N/ui/serverWidget",
        "N/runtime",
        "N/task",
        "N/redirect",
        "N/url"
    ], function(search,serverWidget,runtime,task,redirect,url) {

    function onRequest(context) {
        try {
            var objScriptParams = context.request.parameters;
            var scriptObj = runtime.getCurrentScript();
            var idScript = scriptObj.getParameter("custscript_client_script_id_kerps"); //client script id
            if(context.request.method === 'GET'){

                log.debug("Satrted Governance Units: " , scriptObj.getRemainingUsage());

                var form = serverWidget.createForm({
                    title: 'Kit Conversion Error Reprocess'
                });

                form.clientScriptFileId = idScript;

                //filter group
                var filterGrp = form.addFieldGroup({
                    id: 'custpage_fieldgrp_filter',
                    label: 'Filters'
                });

                //form date
                var fromDateFieldObj = form.addField({
                    id: 'custpage_kit_staging_start_date',
                    label: 'From Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_fromdate){
                    fromDateFieldObj.defaultValue = objScriptParams.custparam_fromdate;
                }

                //to date
                var toDateFieldObj = form.addField({
                    id: 'custpage_kit_staging_to_date',
                    label: 'To Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_todate){
                    toDateFieldObj.defaultValue = objScriptParams.custparam_todate;
                }

                //location 
                var locationFieldObj = form.addField({
                    id: 'custpage_kit_staging_location',
                    label: 'Location',
                    type: serverWidget.FieldType.SELECT,
                    container: 'custpage_fieldgrp_filter'
                });
                //set all the location external id
                var locData = getLocationByExternalId();
                if(locData != false){
                    locationFieldObj.addSelectOption({
                        value : '',
                        text : ''
                    });
                    for(var c in locData){
                        locationFieldObj.addSelectOption({
                            value : locData[c].location_id,
                            text : locData[c].location_external_id
                        });
                    }
                }
                if(objScriptParams.custparam_location){
                    locationFieldObj.defaultValue = objScriptParams.custparam_location;
                }

                //status
                var statusFieldObj = form.addField({
                    id: 'custpage_kit_staging_status',
                    label: 'Status',
                    type: serverWidget.FieldType.SELECT,
                    // source: 'customlist_processing_status',
                    container: 'custpage_fieldgrp_filter'
                });
                //set status
                var statusObj = [{id:1,value:'Pending'},{id:3,value:'Partial Failure'},{id:4,value:'Failed'}];
                statusFieldObj.addSelectOption({
                    value : '',
                    text : ''
                });
                for(var x in statusObj){
                    statusFieldObj.addSelectOption({
                        value : statusObj[x].id,
                        text : statusObj[x].value
                    });
                }
               
                if(objScriptParams.custparam_status){
                    statusFieldObj.defaultValue = objScriptParams.custparam_status;
                }

                //add sublist
                var sublistObj = addSublist(form);

                //add filter button
                form.addButton({
                    id: 'custpage_filter_button',
                    label: 'Search',
                    functionName: 'searchData()'
                });

                //add submit button
                form.addSubmitButton({
                    label: 'Process'
                });

                //set sublist value
                if(objScriptParams.custparam_fromdate || objScriptParams.custparam_todate 
                    || objScriptParams.custparam_location || objScriptParams.custparam_status){
                    setSublistData(sublistObj,objScriptParams.custparam_fromdate,objScriptParams.custparam_todate,objScriptParams.custparam_location,objScriptParams.custparam_status);
                }
                log.debug("Remaing Governance Units: " , scriptObj.getRemainingUsage());
                context.response.writePage(form);
                
            }

            if(context.request.method === 'POST'){
                var fromDate = context.request.parameters.custpage_kit_staging_start_date;
                var toDate = context.request.parameters.custpage_kit_staging_to_date;
                var location = context.request.parameters.custpage_kit_staging_location;
                var status = context.request.parameters.custpage_kit_staging_status;

                log.debug('fromDate=='+fromDate+'||toDate=='+toDate,'location=='+location+'||status=='+status);

                //get the selected customer details
                var lineCount = context.request.getLineCount({
                    group: 'custpage_kit_staging_sublist'
                });

                log.debug('post-linecount',lineCount);

                var stagingRecDetails = [];

                for(var x = 0 ; x < lineCount ; x++){
                    var selected = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_select', line:x});
                    if(selected == 'T' || selected == true){
                        var name = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_name', line:x});
                        var stagingRecId = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_staging_record_id', line:x});
                        var jobNumber = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_jobnumber', line:x});  
                        var loc = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_location', line:x});
                        var assemblyItem = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_assembly_item', line:x});
                        var qty = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_assembly_item_qty', line:x});
                        var date = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_date', line:x});
                        var statuss = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_status', line:x});
                        var errorMessage = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_error_message', line:x});
                        var wo = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_wo_id', line:x});
                        var processsDate = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_pd', line:x});
                        var filename = context.request.getSublistValue({group:'custpage_kit_staging_sublist', name:'custpage_sublist_file_name', line:x});
                        stagingRecDetails.push({
                            name:name,
                            staging_rec_id:stagingRecId,
                            job_number:jobNumber,
                            location:loc,
                            assembly_item:assemblyItem,
                            quantity:qty,
                            date:date,
                            status:statuss,
                            error_message:errorMessage,
                            work_order:wo,
                            process_date:processsDate,
                            file_name:filename
                        });
                    }
                }

                log.debug('post-stagingRecDetails',stagingRecDetails);
                // return;

                if(stagingRecDetails.length > 0){
                    //invoke map reduce for email send
                    var mrTask = task.create({taskType: task.TaskType.MAP_REDUCE});
                    mrTask.scriptId = 'customscript_tnl_mr_reprocess_kit_con';
                    // mrTask.deploymentId = '';
                    mrTask.params = {
                        'custscript_staging_data_reprocess':stagingRecDetails
                    }
                    var mrTaskId = mrTask.submit();

                    log.debug('mrTaskId',mrTaskId);

                    //redirect the suitelet
                    redirect.toSuitelet({
                        scriptId: 'customscript_tnl_sl_reprocess_kit_con',
                        deploymentId: 'customdeploy_tnl_sl_reprocess_kit_con',
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
                id: 'custpage_kit_staging_sublist',
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

            //name
            sublistObj.addField({
                id: 'custpage_sublist_name',
                label: 'Name',
                type: serverWidget.FieldType.TEXT
            });

            //record internalid
            sublistObj.addField({
                id: 'custpage_sublist_staging_record_id',
                label: 'Staging Record Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //job number
            sublistObj.addField({
                id: 'custpage_sublist_jobnumber',
                label: 'Job Number',
                type: serverWidget.FieldType.TEXT
            });

            //location
            sublistObj.addField({
                id: 'custpage_sublist_location',
                label: 'Location',
                type: serverWidget.FieldType.TEXT
            });

            //assembly item
            sublistObj.addField({
                id: 'custpage_sublist_assembly_item',
                label: 'Assembly Item',
                type: serverWidget.FieldType.TEXT
            });

            //assembly item internalid
            sublistObj.addField({
                id: 'custpage_sublist_assembly_item_id',
                label: 'Assembly Item Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //qunatity
            sublistObj.addField({
                id: 'custpage_sublist_assembly_item_qty',
                label: 'Quantity',
                type: serverWidget.FieldType.TEXT
            });

            //date
            sublistObj.addField({
                id: 'custpage_sublist_date',
                label: 'Date',
                type: serverWidget.FieldType.DATE
            });

            //status
            sublistObj.addField({
                id: 'custpage_sublist_status',
                label: 'Status',
                type: serverWidget.FieldType.TEXT
            });

            //error message
            sublistObj.addField({
                id: 'custpage_sublist_error_message',
                label: 'Error Message',
                type: serverWidget.FieldType.TEXT
            });

            //Work Order
            sublistObj.addField({
                id: 'custpage_sublist_wo',
                label: 'Work Order',
                type: serverWidget.FieldType.TEXT
            });

            //Work Order Id
            sublistObj.addField({
                id: 'custpage_sublist_wo_id',
                label: 'Work Order Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //process date
            sublistObj.addField({
                id: 'custpage_sublist_pd',
                label: 'Process Date',
                type: serverWidget.FieldType.TEXT
            });

            //file name
            sublistObj.addField({
                id: 'custpage_sublist_file_name',
                label: 'File Name',
                type: serverWidget.FieldType.TEXT
            });

            return sublistObj;
        } catch (error) {
            log.error('Error : In Add Sublist',error);
        }
    }

    //function to set the sublist value
    function setSublistData(sublistObj,fromDate,toDate,location,status){
        try {
            //get the search data based on applied filters
            var filterArray = [];
            if(fromDate && toDate){
                log.debug('fromDate=='+fromDate,'toDate=='+toDate);
                filterArray.push(search.createFilter({
                    name: 'custrecord_stg_kc_date',//process date needs to chek 
                    operator: 'within',
                    values: [fromDate,toDate]
                }));
            }
            if(location){
                var locObj = search.lookupFields({
                    type: search.Type.LOCATION,
                    id: location,
                    columns: ['externalid']
                });
                var locExtId = locObj.externalid;
                log.debug('locExtId==',locExtId);
                filterArray.push(search.createFilter({
                    name: 'custrecord_stg_kc_location',
                    operator: 'is',
                    values: locExtId[0].value
                }));
            }
            if(status){
                filterArray.push(search.createFilter({
                    name: 'custrecord_stg_kc_status',
                    operator: 'anyof',
                    values: status
                }));
            }
           /*  else{
                filterArray.push(search.createFilter({
                    name: 'custrecord_stg_kc_status',
                    operator: 'anyof',
                    values: [3,4]
                }));
            } */
           
            filterArray.push(search.createFilter({
                name: 'isinactive',
                operator: 'is',
                values: 'F'
            }));

            var customrecord_kit_conversion_stagingSearchObj = search.create({
                type: "customrecord_kit_conversion_staging",
                filters:filterArray,
                columns:[
                    search.createColumn({name: "name", label: "Name"}),
                    search.createColumn({name: "custrecord_stg_kc_job_number", label: "Job Number"}),
                    search.createColumn({name: "custrecord_stg_kc_assembly_item", label: "Assembly Item"}),
                    search.createColumn({name: "custrecord_stg_kc_component", label: "Component"}),
                    search.createColumn({name: "custrecord_stg_kc_date", label: "Date"}),
                    search.createColumn({
                        name: "created",
                        sort: search.Sort.DESC,
                        label: "Date Created"
                    }),
                    search.createColumn({name: "custrecord_stg_kc_location", label: "Location"}),
                    search.createColumn({name: "custrecord_stg_kc_quantity", label: "Quantity"}),
                    search.createColumn({name: "custrecord_stg_kc_status", label: "Status"}),
                    search.createColumn({name: "custrecord_stg_kc_error_message", label: "Error Message"}),
                    search.createColumn({name: "custrecord_stg_kc_file_name", label: "File Name"}),
                    search.createColumn({name: "custrecord_stg_kc_ns_work_order", label: "Work Order"}),
                    search.createColumn({name: "custrecord_stg_kc_process_date", label: "Process Date"})
                ]
            });
            var searchResultCount = customrecord_kit_conversion_stagingSearchObj.runPaged().count;
            log.debug("Reprocess result count",searchResultCount);
            var lineNumber = Number(0);
            customrecord_kit_conversion_stagingSearchObj.run().each(function(result){
                //name
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_name',
                    line: lineNumber,
                    value: '<a href="'+url.resolveRecord({recordType: 'customrecord_kit_conversion_staging',recordId: result.id,isEditMode: false})+'">'+result.getValue({name: "name"})+'</a>'
                });

                //record id
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_staging_record_id',
                    line: lineNumber,
                    value: result.id
                });

                //job number
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_jobnumber',
                    line: lineNumber,
                    value: result.getValue({name: "custrecord_stg_kc_job_number"})
                });

                //location
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_location',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_location"})
                });

                //assembly item
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_assembly_item',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_assembly_item"})
                });

                //quantity
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_assembly_item_qty',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_quantity"})
                });

                //date
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_date',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_date"})
                });

                //status
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_status',
                    line: lineNumber,
                    value: result.getText({ name: "custrecord_stg_kc_status"})
                });

                //error message
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_error_message',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_error_message"})?JSON.parse(result.getValue({ name: "custrecord_stg_kc_error_message"})).data:'-NA-'
                });

                //work order
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_wo',
                    line: lineNumber,
                    value:  result.getValue({ name: "custrecord_stg_kc_ns_work_order"})?'<a href="'+url.resolveRecord({recordType: 'workorder',recordId: result.getValue({ name: "custrecord_stg_kc_ns_work_order"}),isEditMode: false})+'">'+result.getText({ name: "custrecord_stg_kc_ns_work_order"})+'</a>':'-NA-'
                });

                //work order id
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_wo_id',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_ns_work_order"})?result.getValue({ name: "custrecord_stg_kc_ns_work_order"}):'-NA-'
                });

                //process date
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_pd',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_process_date"})?result.getValue({ name: "custrecord_stg_kc_process_date"}):'-NA-'
                });

                //file name
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_file_name',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_kc_file_name"})?result.getValue({ name: "custrecord_stg_kc_file_name"}):'-NA-'
                });

                lineNumber++;
                return true;
            });
            
        } catch (error) {
            log.error('Error : In Set Sublist Data',error);
        }
    }

    //function to get the locations to set in the location list field
    function getLocationByExternalId(){
        try {
            var locationSearchObj = search.create({
                type: "location",
                filters:
                [
                   ["externalid","noneof","@NONE@"], 
                  /*  "AND", 
                   ["custrecord_external_id_source","isempty",""],  */
                   "AND", 
                   ["isinactive","is","F"]
                ],
                columns:
                [
                   //search.createColumn({name: "custrecord_location_parent_upload", label: "Parent Location Custom"}),
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "externalid", label: "External ID"})
                ]
            });
            var searchResultCount = locationSearchObj.runPaged().count;
            log.debug("Location Count",searchResultCount);
            var locData = [];
            locationSearchObj.run().each(function(result){
                locData.push({
                    location_id:result.id,
                    location_name:result.getValue('name'),
                    location_external_id:result.getValue('externalid')
                })
                return true;
            });
            return locData;
        } catch (error) {
            log.error('Error : In Get Location By ExternalId',error);
            return false;
        }
    }

    return {
        onRequest: onRequest
    }
});