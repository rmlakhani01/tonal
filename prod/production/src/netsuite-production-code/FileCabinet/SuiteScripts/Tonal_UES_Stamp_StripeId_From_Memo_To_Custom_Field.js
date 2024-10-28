/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UES Stamp StripeId From Memo To Custom Field
 * File Name   : Tonal_UES_Stamp_StripeId_From_Memo_To_Custom_Field.js
 * Description : This script is used for stamp stripeid on CP, CD from memo to custom field
 * Created On  : 02/07/2024
 * Modification Details: 
 * ***********************************************************/
let runtime;
define(["N/runtime"], main);
function main(runtimeModule) {
    try {
        
        runtime = runtimeModule;

        return {
            beforeSubmit: setStriprIdFromMemo
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const setStriprIdFromMemo = (context) => {
    try {
        let ct = context.type;
        let rtc = runtime.executionContext;
        log.debug('ct=='+ct,'rtc=='+rtc);
        let recType = context.newRecord.type;
        log.debug('recType==',recType);
        if(ct == 'create' || ct == 'edit'){
            let recObj = context.newRecord;
            let memo = recObj.getValue('memo');
            let stripeChargeId = recObj.getValue('custbody_stripe_charge_id');
            if(memo && memo.includes('Stripe') && !stripeChargeId){
                memo = memo.split('Stripe: ')[1];
                recObj.setValue('custbody_stripe_charge_id',memo);
                log.debug('Stripe Id Set Sucessfully!!');
            }
        }
    } catch (error) {
       log.error('Error : In Set StripeId From Memo',error); 
    }
}