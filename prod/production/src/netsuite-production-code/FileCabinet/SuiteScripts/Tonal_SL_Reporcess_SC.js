/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
/*************************************************************
 * File Header
 * Script Type : Suitelet Script
 * Script Name : Tonal SL Reporcess SC
 * File Name   : Tonal_CL_Reporcess_SC.js
 * Description : This script is used for reprocess shipconfirmation where status is other than 'success'
 * Created On  : 01/3/2023
 * Modification Details:  
 * Version              Instance            By              Date                        Description
 * V1                   SB1                 Vikash          27/03/2023                  modified for show data on UI for pending,failed
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
            var idScript = scriptObj.getParameter("custscript_client_script_id_scerps"); //client script id
            if(context.request.method === 'GET'){

                log.debug("Satrted Governance Units: " , scriptObj.getRemainingUsage());

                var form = serverWidget.createForm({
                    title: 'Ship Confirmation Error Reprocess'
                });

                form.clientScriptFileId = idScript;

                //filter group
                var filterGrp = form.addFieldGroup({
                    id: 'custpage_fieldgrp_filter',
                    label: 'Filters'
                });

                //name
                var nameFieldObj = form.addField({
                    id: 'custpage_sc_staging_name',
                    label: 'Name',
                    type: serverWidget.FieldType.TEXT,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_name){
                    nameFieldObj.defaultValue = objScriptParams.custparam_name;
                }

                //status
                var statusFieldObj = form.addField({
                    id: 'custpage_sc_staging_status',
                    label: 'Status',
                    type: serverWidget.FieldType.SELECT,
                    container: 'custpage_fieldgrp_filter',
                    //source:'customlist_processing_status_2_2'
                });
                //set status
                var statusObj = [{id:1,value:'Pending'},/* {id:3,value:'Partial Failure'}, */{id:4,value:'Failed'}];
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

                //error message
                var errorFieldObj = form.addField({
                    id: 'custpage_sc_staging_error',
                    label: 'Error',
                    type: serverWidget.FieldType.TEXT,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_error){
                    errorFieldObj.defaultValue = objScriptParams.custparam_error;
                }

                //file name
                var fileFieldObj = form.addField({
                    id: 'custpage_sc_staging_file_name',
                    label: 'File Name',
                    type: serverWidget.FieldType.TEXT,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_file){
                    fileFieldObj.defaultValue = objScriptParams.custparam_file;
                }

                //from date
                var fromDateFieldObj = form.addField({
                    id: 'custpage_sc_staging_start_date',
                    label: 'Creation From Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_fromdate){
                    fromDateFieldObj.defaultValue = objScriptParams.custparam_fromdate;
                }

                //to date
                var toDateFieldObj = form.addField({
                    id: 'custpage_sc_staging_to_date',
                    label: 'Creation To Date',
                    type: serverWidget.FieldType.DATE,
                    container: 'custpage_fieldgrp_filter'
                });
                if(objScriptParams.custparam_todate){
                    toDateFieldObj.defaultValue = objScriptParams.custparam_todate;
                }

                //add sublist
                var sublistObj = addSublist(form);

                //add filter button search
                form.addButton({
                    id: 'custpage_filter_button_search',
                    label: 'Search',
                    functionName: 'searchData()'
                });

                //add refresh button
                form.addButton({
                    id: 'custpage_filter_button_refresh',
                    label: 'Refresh',
                    functionName: 'refresh()'
                });

                //add submit button
                form.addSubmitButton({
                    label: 'Reprocess'
                });

                //set sublist value
                if(objScriptParams.custparam_fromdate || objScriptParams.custparam_todate 
                    || objScriptParams.custparam_name || objScriptParams.custparam_status
                    || objScriptParams.custparam_error || objScriptParams.custparam_file){
                    setSublistData(sublistObj,objScriptParams.custparam_fromdate,objScriptParams.custparam_todate,objScriptParams.custparam_name,objScriptParams.custparam_status,objScriptParams.custparam_error,objScriptParams.custparam_file,'');
                }
                //set with all other status except 'success' & 'partial failure'
                else{
                    setSublistData(sublistObj,'','','','','','','defaultallstatus');
                }
                log.debug("Remaing Governance Units: " , scriptObj.getRemainingUsage());
                context.response.writePage(form);
            }
            if(context.request.method === 'POST'){
                var name = context.request.parameters.custpage_sc_staging_name;
                var status = context.request.parameters.custpage_sc_staging_status;
                var error = context.request.parameters.custpage_sc_staging_error;
                var fileName = context.request.parameters.custpage_sc_staging_file_name;
                var creationFromDate = context.request.parameters.custpage_sc_staging_start_date;
                var creationToDate = context.request.parameters.custpage_sc_staging_to_date;

                log.debug('name=='+name+'||status=='+status,'error=='+error+'||fileName=='+fileName+'||creationFromDate=='+creationFromDate+'||creationToDate=='+creationToDate);

                //get the selected customer details
                var lineCount = context.request.getLineCount({
                    group: 'custpage_sc_staging_sublist'
                });

                log.debug('post-linecount',lineCount);
                var reProcessData = [];
                for(var x = 0 ; x < lineCount ; x++){
                    var selected = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_select', line:x});
                    if(selected == 'T' || selected == true){
                        var scStagingRecId = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_staging_record_id', line:x});
                        var scStagingRecname = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_name_text', line:x});
                        var scStagingStatus = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_status', line:x});
                        var scStagingError = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_error_message', line:x});
                        var scStagingProcessDate = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_pd', line:x});
                        var scStagingFileName = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_file_name', line:x});
                        var scStagingCreationDate = context.request.getSublistValue({group:'custpage_sc_staging_sublist', name:'custpage_sublist_date', line:x});
                        reProcessData.push({
                            sc_stg_rec_id:scStagingRecId,
                            sc_stg_rec_name:scStagingRecname,
                            sc_stg_status:scStagingStatus,
                            sc_stg_error:scStagingError,
                            sc_stg_pd:scStagingProcessDate,
                            sc_stg_file_name:scStagingFileName,
                            sc_stg_cd:scStagingCreationDate
                        });
                    }
                }
                
                log.debug('reProcessData==',reProcessData);
                if(reProcessData.length > 0){
                    //invoke map reduce for email send
                    var mrTask = task.create({taskType: task.TaskType.MAP_REDUCE});
                    mrTask.scriptId = 'customscript_tnl_mr_sc_processor';
                    // mrTask.deploymentId = '';
                    mrTask.params = {
                        'custscript_sc_reprocess_data':reProcessData
                    }
                    var mrTaskId = mrTask.submit();

                    log.debug('mrTaskId',mrTaskId);

                    //redirect the suitelet
                    redirect.toSuitelet({
                        scriptId: 'customscript_tnl_sl_reprcess_sc',
                        deploymentId: 'customdeploy_tnl_sl_reprcess_sc',
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
                id: 'custpage_sc_staging_sublist',
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

            //name text
            sublistObj.addField({
                id: 'custpage_sublist_name_text',
                label: 'Name Text',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //record internalid
            sublistObj.addField({
                id: 'custpage_sublist_staging_record_id',
                label: 'Staging Record Id',
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({displayType: serverWidget.FieldDisplayType.HIDDEN});

            //sc header
           /*  sublistObj.addField({
                id: 'custpage_sublist_scheader',
                label: 'Bulk Order Header',
                type: serverWidget.FieldType.TEXTAREA
            }); */

            //sc lines
            /* sublistObj.addField({
                id: 'custpage_sublist_sclines',
                label: 'Bulk Order Lines',
                type: serverWidget.FieldType.TEXTAREA
            }); */

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

            //creation date
            sublistObj.addField({
                id: 'custpage_sublist_date',
                label: 'Creation Date',
                type: serverWidget.FieldType.TEXT
            });

            return sublistObj;
        } catch (error) {
            log.error('Error : In Add Sublist',error);
        }
    }

    //function to set the sublist value
    function setSublistData(sublistObj,fromDate,toDate,name,status,error,file,defaultAllStatus){
        try {
            //get the search data based on applied filters
            var filterArray = [];
            if(defaultAllStatus == ''){
                if(fromDate && toDate){
                    filterArray.push(search.createFilter({
                        name: 'created',
                        operator: 'within',
                        values: [fromDate,toDate]
                    }));
                }
                if(name){
                    filterArray.push(search.createFilter({
                        name: 'name',
                        // operator: search.Operator.HASKEYWORDS,
                        operator: search.Operator.CONTAINS,
                        values: name
                    }));
                }
                if(status){
                    filterArray.push(search.createFilter({
                        name: 'custrecord_stg_sc_status',
                        operator: 'anyof',
                        values: status
                    }));
                }
                else{
                    filterArray.push(search.createFilter({
                        name: 'custrecord_stg_sc_status',
                        operator: 'noneof',
                        values: ["2","3"]
                    }));
                }
                if(error){
                    filterArray.push(search.createFilter({
                        name: 'custrecord_stg_sc_error_message',
                        operator: 'contains',
                        values:error
                    }));
                }
                if(file){
                    filterArray.push(search.createFilter({
                        name: 'custrecord_stg_sc_file_name',
                        operator: 'contains',
                        values:file
                    }));
                }
            }
            else if(defaultAllStatus == 'defaultallstatus'){
                filterArray.push(search.createFilter({
                    name: 'custrecord_stg_sc_status',
                    operator: 'noneof',
                    values: ["2","3"]
                }));
            }
           
            filterArray.push(search.createFilter({
                name: 'isinactive',
                operator: 'is',
                values: 'F'
            }));

            var customrecord_ship_confirm_stagingSearchObj  = search.create({
                type: "customrecord_ship_confirm_staging",
                filters:filterArray,
                columns:[
                    search.createColumn({name: "name", label: "Name"}),
                    search.createColumn({name: "custrecord_stg_sc_header", label: "Ship Confirm Header"}),
                    search.createColumn({name: "custrecord_stg_sc_lines", label: "Ship Confirm Lines"}),
                    search.createColumn({name: "custrecord_stg_sc_status", label: "Status"}),
                    search.createColumn({name: "custrecord_stg_sc_error_message", label: "Error Message"}),
                    search.createColumn({name: "custrecord_stg_sc_process_date", label: "Processing Date"}),
                    search.createColumn({name: "custrecord_stg_sc_file_name", label: "File Name"}),
                    search.createColumn({
                       name: "created",
                       sort: search.Sort.DESC,
                       label: "Date Created"
                    })
                ]
            });
            var searchResultCount = customrecord_ship_confirm_stagingSearchObj .runPaged().count;
            log.debug("Reprocess result count",searchResultCount);
            var lineNumber = Number(0);
            customrecord_ship_confirm_stagingSearchObj.run().each(function(result){
                //name
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_name',
                    line: lineNumber,
                    value: '<a href="'+url.resolveRecord({recordType: 'customrecord_ship_confirm_staging',recordId: result.id,isEditMode: false})+'">'+result.getValue({name: "name"})+'</a>'
                });

                //name text
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_name_text',
                    line: lineNumber,
                    value: result.getValue({name:'name'})
                });

                //record id
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_staging_record_id',
                    line: lineNumber,
                    value: result.id
                });

                //sc header
                /* sublistObj.setSublistValue({
                    id: 'custpage_sublist_scheader',
                    line: lineNumber,
                    value: result.getValue({name: "custrecord_stg_sc_header"})
                }); */

                //sc lines
                /* var scLines = result.getValue({ name: "custrecord_stg_sc_lines"});
                if(scLines.length > 4000){
                    scLines = scLines.substring(0,4000);
                }
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_sclines',
                    line: lineNumber,
                    value: scLines
                }); */

                //created date
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_date',
                    line: lineNumber,
                    value: result.getValue({ name: "created"})
                });

                //status
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_status',
                    line: lineNumber,
                    value: result.getText({ name: "custrecord_stg_sc_status"})
                });

                //error message
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_error_message',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_sc_error_message"})?JSON.stringify(result.getValue({ name: "custrecord_stg_sc_error_message"})):'-NA-'
                });

                //process date
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_pd',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_sc_process_date"})?result.getValue({ name: "custrecord_stg_sc_process_date"}):'-NA-'
                });

                //file name
                sublistObj.setSublistValue({
                    id: 'custpage_sublist_file_name',
                    line: lineNumber,
                    value: result.getValue({ name: "custrecord_stg_sc_file_name"})?result.getValue({ name: "custrecord_stg_sc_file_name"}):'-NA-'
                });

                lineNumber++;
                return true;
            });
            
        } catch (error) {
            log.error('Error : In Set Sublist Data',error);
        }
    }

    return {
        onRequest: onRequest
    }
});
