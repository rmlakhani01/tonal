/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Unset MJE2
 * File Name   : Tonla_MR_Unset_MJE2.js
 * Description : This script is used for unset MJE2 field value
 * Created On  : 07/03/2024
 * Modification Details:  
 ************************************************************/
let record,runtime,search;
define(["N/record","N/runtime","N/search"], main);
function main(recordModule,runtimeModule,searchModule) {

   record = recordModule;
   runtime = runtimeModule;
   search = searchModule;

    return {
        getInputData: getInputData,
        map: map
    }
}
const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_mje2_data');
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
        log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        let recType = data.values.recordtype;
        let recId = context.key;
        if(recId && recType){
            let id = record.submitFields({
                type: recType,
                id: recId,
                values: {
                    custbody_merchant_fee_je_2:''
                }
            });
            if(id){
                log.debug('Record Updated For MJE2',recId);
            }
        }
    } catch (error) {
        log.error('Errro : In Map Stage',error);
    }
}