/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(["N/search","N/record","N/runtime"], function(search,record,runtime) {

    function getInputData() {
        try {
            //get the search details from the script parameter
            var scriptObj = runtime.getCurrentScript();
            var transactionSearchId = scriptObj.getParameter('custscript_cust_da_search_data');
            if(!transactionSearchId){
                log.debug('Please Add Transacion Data', 'Transaction Search Id||'+transactionSearchId);
                return [];
            }

            //load the search data and return to map stage
            return search.load({
                id: transactionSearchId
            });
        } catch (error) {
            log.error('Error : In Get Inputs Stage',error);
            return [];
        }
    }

    function map(context) {
        try {
            // log.debug('Map Context', context);
            var daRecordId = JSON.parse(context.key);
            var data = JSON.parse(context.value);
            var invDate = data.values["trandate.appliedToTransaction"];
            var daDate = data.values.trandate;
            log.debug('invDate=='+invDate,'daDate=='+daDate+'||daRecordId=='+daRecordId);
            
            //update the DA date as INV date
            record.submitFields({
                type: record.Type.DEPOSIT_APPLICATION,
                id: daRecordId,
                values: {
                    'trandate':new Date(invDate)
                }
            });
        } catch (error) {
            log.error('Error : In Map Stage',error);
        }
    }

    return {
        getInputData: getInputData,
        map: map
    }
});
