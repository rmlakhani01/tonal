/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
/*************************************************************
 * File Header
 * Script Type : Client Script
 * Script Name : Tonal CL Reprocess Kit Conversion
 * File Name   : Tonal_CL_Reprocess_Kit_Conversion.js
 * Description : This script is used for create work order and assembly build for the kit conversion by taking the 
 * data fromm tha Work Order Staging Table with status partial and fail for supporting
 * Created On  : 26/12/2022
 * Modification Details:  
 ************************************************************/
define(["N/currentRecord","N/url","N/ui/message","N/runtime"], function(currentRecord,url,message,runtime) {

    function saveRecord(context) {
        try {
            // alert('SaveRecord');
            var recordData = context.currentRecord;
            var lineCount = recordData.getLineCount({
                sublistId: 'custpage_kit_staging_sublist'
            });
            log.debug('saveLineCount==',lineCount);
            if(lineCount == -1 || lineCount == 0){
                alert('Please Select One Kit Data For Process.');
                return false;
            }
            if(lineCount > 0){
                var selectedLines = [], notSelectedLines = [];
                for(var c = 0 ; c < lineCount ; c++){
                    var selected = recordData.getSublistValue({
                        sublistId: 'custpage_kit_staging_sublist',
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
                    alert('Please Select One Kit Data For Process.');
                    return false
                }
            }
            var myMsg = message.create({
                title: "Confirmation",
                message: "Reporcessing Error Kitting Data",
                type: message.Type.CONFIRMATION
            });
            myMsg.show({ duration : 1500 });
            
            //Redirect to process search 
            var envType = runtime.envType;
            var accountId = runtime.accountId;
            var s_URL = '';
            if(envType == 'SANDBOX' && accountId == '4901956_SB1'){
                s_URL = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_error_reproces_kit_data&whence=';
            }
            if(envType == 'SANDBOX' && accountId == '4901956_SB2'){
                s_URL = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_error_reproces_kit_data&whence=';
            }
            if(envType == 'PRODUCTION' && accountId == '4901956'){
                s_URL = s_URL = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_tnl_error_reproces_kit_data&whence=';;
            }
            window.onbeforeunload = null;
            window.open(s_URL,null, null, null);  
            return true;
        } catch (error) {
            log.error('Error : In Client Save',error);
        }
    }

    //function to get the staging record re process data
    function searchData(){
        try {
            var recordData = currentRecord.get();
            var formDate = recordData.getText('custpage_kit_staging_start_date');
            var toDate = recordData.getText('custpage_kit_staging_to_date');
            var location = recordData.getValue('custpage_kit_staging_location');
            var status = recordData.getValue('custpage_kit_staging_status');
        
            var urlParameters = {};
            if(formDate){
                urlParameters.custparam_fromdate = formDate;
            }
            if(toDate){
                urlParameters.custparam_todate = toDate;
            }
            if(location){
                urlParameters.custparam_location = location;
            }
            if(status){
                urlParameters.custparam_status = status;
            }
            var suiteletURL = url.resolveScript({
                scriptId: 'customscript_tnl_sl_reprocess_kit_con',
                deploymentId: 'customdeploy_tnl_sl_reprocess_kit_con',
                returnExternalUrl: false,
                params: urlParameters
            });
            window.onbeforeunload = null;
            window.open(suiteletURL,'_self');
        } catch (error) {
            log.error('Error : In Search Data',error);
        }
    }

    return {
        saveRecord: saveRecord,
        searchData:searchData
    }
});
