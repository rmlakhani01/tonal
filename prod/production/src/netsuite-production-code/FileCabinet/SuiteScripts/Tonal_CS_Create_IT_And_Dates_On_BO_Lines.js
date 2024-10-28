/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
/*************************************************************
 * File Header
 * Script Type : Cleint Script
 * Script Name : Tonal CS Create IT And Dates On BO Lines
 * File Name   : Tonal_CS_Create_IT_And_Dates_On_BO_Lines.js
 * Description : This script is dependent on the suitelet error reprocess for bo so lines
 * Created On  : 02/02/2023
 * Modification Details:  
 ************************************************************/
define(["N/currentRecord","N/url","N/ui/message","N/runtime"], function(currentRecord,url,message,runtime) {

    function saveRecord(context) {
        try {
            // alert('SaveRecord');
            var recordData = context.currentRecord;
            var lineCount = recordData.getLineCount({
                sublistId: 'custpage_mm_er_sublist'
            });
            log.debug('saveLineCount==',lineCount);
            if(lineCount == -1 || lineCount == 0){
                alert('Please Select One Data For Process.');
                return false;
            }
            if(lineCount > 0){
                var selectedLines = [], notSelectedLines = [];
                for(var c = 0 ; c < lineCount ; c++){
                    var selected = recordData.getSublistValue({
                        sublistId: 'custpage_mm_er_sublist',
                        fieldId: 'custpage_sublist_select',
                        line: c
                    });
                    if(selected == 'T' || selected == true){
                        selectedLines.push(c);
                    }
                    if(selected == 'F' || selected == false){
                        notSelectedLines.push(c);
                    }
                }

                log.debug('selectedLines=='+selectedLines,'notSelectedLines=='+notSelectedLines);
                if(selectedLines.length == 0 && (notSelectedLines.length >= 0)){
                    alert('Please Select One Data For Process.');
                    return false
                }
            }
            var myMsg = message.create({
                title: "Confirmation",
                message: "Reporcessing Error MidMile Data",
                type: message.Type.CONFIRMATION
            });
            myMsg.show({ duration : 1500 });
            
            //Redirect to process search 
            var envType = runtime.envType;
            var accountId = runtime.accountId;
            var s_URL = '';//,scriptId = '1507';//runtime.getCurrentScript().getParameter('custscript_mr_script_status_id');
            if(envType == 'SANDBOX' && accountId == '4901956_SB1'){
                s_URL = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_bo_sol_lines_reproces_2&whence=';
            }
            if(envType == 'SANDBOX' && accountId == '4901956_SB2'){
                s_URL = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_bo_sol_lines_reproces_2&whence=';
            }
            if(envType == 'PRODUCTION' && accountId == '4901956'){
                s_URL =  s_URL = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_bo_sol_lines_reproces_2&whence=';
            }
           /*  if(envType == 'SANDBOX' && accountId == '4901956_SB1'){
                s_URL = 'https://4901956-sb1.app.netsuite.com/app/common/scripting/mapreducescriptstatus.nl?daterange=TODAY&scripttype='+scriptId+'';
            }
            if(envType == 'SANDBOX' && accountId == '4901956_SB2'){
                s_URL = 'https://4901956-sb2.app.netsuite.com/app/common/scripting/mapreducescriptstatus.nl?daterange=TODAY&scripttype='+scriptId+'';
            }
            if(envType == 'PRODUCTION' && accountId == '4901956'){
                s_URL =  s_URL = 'https://4901956.app.netsuite.com/app/common/scripting/mapreducescriptstatus.nl?daterange=TODAY&scripttype='+scriptId+'';
            } */
            window.onbeforeunload = null;
            window.open(s_URL,null, null, null);  
            return true;
        } catch (error) {
            log.error('Error : In Client Save',error);
        }
    }

    //function for select and unselect so/bulk so from the list based on one selection of so/bulk so 
    function fieldChanged(context){
        try {
            // alert('fieldChanged');
            var sublistName = context.sublistId;
            var sublistFieldName = context.fieldId;
            var recordData = context.currentRecord;
            if(sublistName == 'custpage_mm_er_sublist' && sublistFieldName == 'custpage_sublist_select' ){
                
                var lineCount = recordData.getLineCount({
                    sublistId: 'custpage_mm_er_sublist'
                });
    
                var selected = recordData.getCurrentSublistValue({
                    sublistId: 'custpage_mm_er_sublist',
                    fieldId: 'custpage_sublist_select'
                });
    
                var boId = recordData.getCurrentSublistValue({
                    sublistId: 'custpage_mm_er_sublist',
                    fieldId: 'custpage_sublist_parent_id'
                });
               
                log.debug('boId=='+boId,'selected=='+selected);
    
                var currIndex = recordData.getCurrentSublistIndex({
                    sublistId: 'custpage_mm_er_sublist'
                });
    
                log.debug('currIndex==',currIndex);
                //alert('lineCount=='+lineCount+'||boId=='+boId+'||selected=='+selected+'||currIndex=='+currIndex);
    
                //loop through all the line and find the same bulk order id and make seletced flag true
                for(var c = 0 ; c < lineCount ; c++){
                    //check
                    if(c != currIndex && boId && selected == true){
        
                        //get the bulk order id
                        var cBoId = recordData.getSublistValue({
                            sublistId: 'custpage_mm_er_sublist',
                            fieldId: 'custpage_sublist_parent_id',
                            line:c
                        });
                        // alert('cBoId=='+cBoId+'||boId=='+boId);
    
                        //make select flag true
                        if(cBoId == boId){
                            // alert('SettingMatched');

                            recordData.selectLine({
                                sublistId: 'custpage_mm_er_sublist',
                                line: c
                            });

                            recordData.setCurrentSublistValue({
                                sublistId:'custpage_mm_er_sublist',
                                fieldId:'custpage_sublist_select',
                                value:true,
                                ignoreFieldChange: true,
                                // forceSyncSourcing: false
                            });

                            recordData.commitLine({
                                sublistId: 'custpage_mm_er_sublist'
                            });

                           /*  //disable the field
                            var objField = objRecord.getSublistField({
                                sublistId: 'custpage_mm_er_sublist',
                                fieldId: 'custpage_sublist_select',
                                line: c
                            });
                            objField.isDisabled = true; */
                        }
                    }
                    //uncheck
                    else if(/* c != currIndex && */ boId && selected == false){
                        //get the bulk order id
                        var cBoId = recordData.getSublistValue({
                            sublistId: 'custpage_mm_er_sublist',
                            fieldId: 'custpage_sublist_parent_id',
                            line:c
                        });
                        // alert('cBoId=='+cBoId+'||boId=='+boId);
    
                        //make select flag true
                        if(cBoId == boId){
                            // alert('SettingMatched1');

                            recordData.selectLine({
                                sublistId: 'custpage_mm_er_sublist',
                                line: c
                            });

                            recordData.setCurrentSublistValue({
                                sublistId:'custpage_mm_er_sublist',
                                fieldId:'custpage_sublist_select',
                                value:false,
                                ignoreFieldChange: true,
                                // forceSyncSourcing: false
                            });

                            recordData.commitLine({
                                sublistId: 'custpage_mm_er_sublist'
                            });

                           /*  //disable the field
                            var objField = objRecord.getSublistField({
                                sublistId: 'custpage_mm_er_sublist',
                                fieldId: 'custpage_sublist_select',
                                line: c
                            });
                            objField.isDisabled = true; */
                        }
                    }
                }
            }
        } catch (error) {
            log.error('Error : In Field Chaged',error);
        }
    }

    //function to get the staging record re process data
    function searchData(){
        try {
            var recordData = currentRecord.get();
            var formDate = recordData.getText('custpage_mm_er_start_date');
            var toDate = recordData.getText('custpage_mm_er_to_date');
            var parent = recordData.getValue('custpage_mm_er_parent');
            var parentWild = recordData.getValue('custpage_mm_er_parent_wild_search');
        
            var urlParameters = {};
            if(formDate){
                urlParameters.custparam_fromdate = formDate;
            }
            if(toDate){
                urlParameters.custparam_todate = toDate;
            }
            if(parent){
                urlParameters.custparam_bulkorder = parent;
            }
            if(parentWild){
                urlParameters.custparam_bulkorderwild = parentWild;
            }
            var suiteletURL = url.resolveScript({
                scriptId: 'customscript_tnl_sl_create_it_update_bsl',
                deploymentId: 'customdeploy_tnl_sl_create_it_update_bsl',
                returnExternalUrl: false,
                params: urlParameters
            });
            window.onbeforeunload = null;
            window.open(suiteletURL,'_self');
        } catch (error) {
            log.error('Error : In Search Data',error);
        }
    }

    //function to reset the filters and show all error record except 'success' status
    function refresh(){
        try {
            var recordData = currentRecord.get();
            var formDate = recordData.getText('custpage_mm_er_start_date');
            var toDate = recordData.getText('custpage_mm_er_to_date');
            var parent = recordData.getValue('custpage_mm_er_parent');
            var parentWild = recordData.getValue('custpage_mm_er_parent_wild_search');
        
            var urlParameters = {};
            if(formDate){
                urlParameters.custparam_fromdate = formDate;
            }
            if(toDate){
                urlParameters.custparam_todate = toDate;
            }
            if(parent){
                urlParameters.custparam_bulkorder = parent;
            }
            if(parentWild){
                urlParameters.custparam_bulkorderwild = parentWild;
            }
            var suiteletURL = url.resolveScript({
                scriptId: 'customscript_tnl_sl_create_it_update_bsl',
                deploymentId: 'customdeploy_tnl_sl_create_it_update_bsl',
                returnExternalUrl: false,
                // params: urlParameters
            });
            window.onbeforeunload = null;
            window.open(suiteletURL,'_self');
        } catch (error) {
            log.error('Error : In Refresh',error);
        }
    }

    return {
        saveRecord: saveRecord,
        fieldChanged:fieldChanged,
        searchData: searchData,
        refresh:refresh
    }
});
