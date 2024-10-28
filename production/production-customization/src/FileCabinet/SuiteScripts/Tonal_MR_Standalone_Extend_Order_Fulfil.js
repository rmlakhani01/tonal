/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Standalone Extend Order Fulfil
 * File Name   : Tonal_MR_Standalone_Extend_Order_Fulfil.js
 * Description : This script is used for create fulfilment for Extend standalone order. Jira ticket [ES-3188].
 * Created On  : 01/12/2023
 * Modification Details:  
 ************************************************************/
let search,record,runtime;
define(['N/search','N/record','N/runtime'], main);
function main (searchModule,recordModule,runtimeModule) {

    search = searchModule;
    record = recordModule;
    runtime = runtimeModule;

    return {
        getInputData: getInputData,
        map: map,
        reduce : reduce
    }

}

function getInputData() {
    try {
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_extend_sa_so');
        log.debug('ssId==',ssId);
        if(!ssId){
            return [];
        }

        return search.load({
            id: ssId
        });
    } catch (error) {
        log.error('Error : In Get Input Stage',error);
        return [];
    }
}

const map = (context) => {
    try {
       /*  log.debug('mapContext==',context); */
        let soId = JSON.parse(context.key);
        let data = JSON.parse(context.value);
        let soDate = data.values.trandate;
        log.debug('Processing For Sales Order=='+soId,'soDate=='+soDate);
        context.write({key:soId,value:{status:'success',salesOrderId:soId,salesOrderDate:soDate}});
    } catch (error) {
        log.error('Error : In Map Stage',error);
        context.write({key:soId,value:{status:'fail',salesOrderId:soId,salesOrderDate:soDate}});
    }
}

const reduce = (context) => {
    try {
        /* log.debug('reduceContext==',context); */
        let data = JSON.parse(context.values[0]);
        let status = data.status;
        let soId = data.salesOrderId;
        let soDate = data.salesOrderDate;
        //transform the so to fulfilemnt
        if(status == 'success'){
            let ifObj = record.transform({
            fromType: record.Type.SALES_ORDER,
            fromId: soId,
            toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });

            ifObj.setText('trandate',soDate);

            ifObj.setValue({fieldId:'shipstatus',value:'C'}); // Set To Shipped

            // Loop Lines and Set Location
            var fulfillmentLineCount = ifObj.getLineCount({sublistId:'item'});
            for (var i = 0; i < fulfillmentLineCount; i++) {
                ifObj.selectLine({sublistId:'item', line:i});
                ifObj.setCurrentSublistValue({sublistId:'item',fieldId:'itemreceive', value: true});
                ifObj.commitLine({sublistId:'item'});
            }

            // Save Fulfillment
            let ifId = ifObj.save({ignoreMandatoryFields:true});
            if(ifId){
                log.debug('IF Created=='+ifId,'For Sales Order=='+soId);
            }
        }
    } catch (error) {
        log.error('Error : In Reduce Satge',error);
    }
}