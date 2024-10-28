/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Receive Transfer Order
 * File Name   : Tonal_MR_Receive_Transfer_Order.js
 * Description : This script is used for Receive the TO
 * Created On  : 22/03/2023
 * Modification Details:  
 ************************************************************/
define(["N/runtime","N/search","N/record"], function(runtime,search,record) {

    function getInputData() {
        try {
            var scriptObj = runtime.getCurrentScript();
            var ssId = scriptObj.getParameter('custscript_to_process_data');
            var tranDate = scriptObj.getParameter('custscript_to_trandate');
            log.debug('ssId=='+ssId,'tranDate=='+tranDate);
            if(!ssId || !tranDate){
                log.debug('MISSING_SCRIPT_PARMAS',JSON.stringify({ss_id:ssId,tran_date:tranDate}));
                return [];
            }
            return search.load({
                id:ssId 
            });
        } catch (error) {
            log.error('Error : In Get Input Stage',error)
        }
    }

    function map(context) {
        try {
            // log.debug('mapContext==',context);
            var scriptObj = runtime.getCurrentScript();
            var tranDate = scriptObj.getParameter('custscript_to_trandate');
            var toId = context.key;
            var toData = JSON.parse(context.value);
            var toStatus = toData.values.statusref.text;
            log.debug('Processing To For IR=='+toId,'To Status=='+toStatus);
            var irObj = record.transform({
                fromType: record.Type.TRANSFER_ORDER,
                fromId: toId,
                toType: record.Type.ITEM_RECEIPT,
                isDynamic: true
            });

            //set trandate
            irObj.setValue('trandate',tranDate);

            var irlineCount = irObj.getLineCount({
                sublistId: 'item'
            });

            //make receive flag true
            for(var irl = 0 ; irl < irlineCount ; irl++){
                irObj.selectLine({
                    sublistId: 'item',
                    line: irl
                });

                irObj.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemreceive',
                    value: true
                });

                irObj.commitLine({
                    sublistId: 'item'
                });
            }

            var irId = irObj.save();

            if(irId){
                log.debug('IR CREATED FOR TO=='+toId,'IR ID=='+irId);
            }

        } catch (error) {
            log.error('Error : In Map Satge',error);
        }
    }

    return {
        getInputData: getInputData,
        map: map
    }
});
