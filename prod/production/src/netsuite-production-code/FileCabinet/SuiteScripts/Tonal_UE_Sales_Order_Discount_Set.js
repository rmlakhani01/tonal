/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UE Sales Order Discount Set
 * File Name   : Tonal_UE_Sales_Order_Discount_Set.js
 * Description : This script is used for set discount item details by reading the discount details from
 * the custom fields
 * Created On  : 24/04/2022
 * Modification Details:  
 * ----Date----                ----Modified By----            ----Description----
 *
 ************************************************************/
/**
 * Update History
 * Version          Insatnce            Date                By              Requested By                Description
 * V1               SB1                 09/11/2023          Vikash          Ali, Hemant Arora           Modification for the script needs to run on INVOICE and same discount item and rate needs to populate on Invoice as well
 * V2               SB1                 13/11/2023          Vikash          Ali, Hemant Arora           Modifciation for the set discount itemand rate before load instead of after submit context
 * V3               SB1                 30/11/2023          Vikash          Ali, Heman Arora            Modification for the set discount item and rate for RMA created from SO
 * V4               SB1                 12/15/2023          Vikash          Ali, Hemant Arora           Modification for the updated dicosunt and coupon on CM [ES-3223]
 */
define(["N/record","N/runtime","N/search"], function(record,runtime,search) {

    function addDiscountDetails(context) {
        try {
            var ct = context.type;
            var rtc = runtime.executionContext;
            var itemId = runtime.getCurrentScript().getParameter('custscript_discount_item');
            log.debug('ct=='+ct,'rtc=='+rtc);
            log.debug('itemId==',itemId);
            if((/* ct == 'edit' ||  */ct == 'create') && itemId){
                var recType = context.newRecord.type;
                log.debug('recType==',recType);
                //for sales order 
                if(recType == 'salesorder'){
                    var soObj = record.load({
                        type: context.newRecord.type,
                        id: context.newRecord.id,
                        isDynamic: true
                    });
    
                    var couponCode = soObj.getValue('custbodycustbody4');
                    var couponValue = soObj.getValue('custbodycustbody5');
                    log.debug('couponCode=='+couponCode,'couponValue=='+couponValue);
    
                    if(couponCode && couponValue){
                        soObj.setValue('discountitem',itemId);
                        soObj.setValue('discountrate',-(couponValue));
                        var soId = soObj.save();
                        if(soId){
                            log.debug('SO_UPDATED_WITH_DISCOUNT',soId);
                        }
                    }
                    else{
                        log.debug('NO_ACTION',JSON.stringify({coupon_code:couponCode,coupon_value:couponValue}));
                    }
                }
            }
            else{
                log.debug('NO_ACTION',JSON.stringify({ct:ct,rtc:rtc,item_id:itemId}));
            }
        } catch (error) {
            log.error('Error : In Add Discount Details',error);
        }
    }

    function beforeLoad (context) {
        try {
            var ct = context.type;
            var rtc = runtime.executionContext;
            log.debug('BL : ct=='+ct,'rtc=='+rtc);
            var recType = context.newRecord.type;
            log.debug('BL : recType==',recType);
            if((ct == 'create'/*  || ct == 'edit' */) && (recType == 'invoice' || recType == 'returnauthorization' || recType == 'creditmemo')){
                var tranObj = context.newRecord;
                var createdFrom = tranObj.getValue('createdfrom');

                if(createdFrom){
                    var createdFromText = tranObj.getText('createdfrom');
                    log.debug('BL : createdFrom=='+createdFrom,'createdFromText=='+createdFromText);
                    if(createdFromText.includes('Sales Order') || createdFromText.includes('Return Authorization')){
                        if(createdFromText.includes('Sales Order')){
                            var recordType = 'salesorder';
                        }
                        if(createdFromText.includes('Return Authorization')){
                            var recordType = 'returnauthorization';
                        }
                        var soObj = record.load({
                            type: recordType,
                            id: createdFrom,
                            isDynamic: true
                        });

                        if(soObj.getValue('discountitem') && soObj.getValue('discountrate')){
                            tranObj.setValue('discountitem',soObj.getValue('discountitem'));
                            tranObj.setValue('discountrate',soObj.getValue('discountrate').toFixed(2));
                            log.debug('TRANSACTION_UPDATED_WITH_DISCOUNT','OK..');
                        }
                    }
                    else{
                        log.debug('NO_ACTION','Transaction Is Not Created From Sales Order/RMA');
                    }
                }
                else{
                    log.debug('NO_ACTION','Standalone Transaction');
                }
            }
            else{
                log.debug('BL : NO ACTION, CONTEXT IS DIFFERENT',JSON.stringify({ct:ct,rtc:rtc,recType:recType}));
            }
        } catch (error) {
            log.error('Error: In Before Load',error);
        }
    }

    return {
        afterSubmit: addDiscountDetails,
        beforeLoad: beforeLoad
    }
});