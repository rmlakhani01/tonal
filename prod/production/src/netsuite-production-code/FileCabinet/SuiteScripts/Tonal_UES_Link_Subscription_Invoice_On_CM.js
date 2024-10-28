/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
 * File Header
 * Script Type : User Event Script
 * Script Name : Tonal UES Link Subscription Invoice On CM
 * File Name   : Tonal_UES_Link_Subscription_Invoice_On_CM.js
 * Description : This script is used for link subscription invoice on CM
 * Created On  : 02/07/2024
 * Modification Details: 
 * ***********************************************************/
let search,record,runtime;
define(["N/search","N/record","N/runtime"], main);
function main(searchModule,recordModule,runtimeModule) {
    try {
        search = searchModule;
        record = recordModule;
        runtime = runtimeModule;

        return {
            afterSubmit: linkSubscriptionInvoiceOnCM
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const linkSubscriptionInvoiceOnCM = (context) => {
    try {
        let ct = context.type;
        let rtc = runtime.executionContext;
        log.debug('ct=='+ct,'rtc=='+rtc);
        if(ct == 'create' || ct == 'edit'){
            let cmObj = record.load({
                type: context.newRecord.type,
                id: context.newRecord.id,
                isDynamic: true
            });

            let relatedInvoice = cmObj.getValue('custbody8');
            let stripeChargeId = cmObj.getValue('custbody_stripe_chargeid');
            if(!relatedInvoice && stripeChargeId){
                //get the invoice where stripe charge id is same as on CM
                let invDetails = getInvoiceByStripeChargeId(stripeChargeId);
                log.debug('invDetails=='+invDetails.length,invDetails);
                if(invDetails.length > 0){
                    cmObj.setValue('custbody8',invDetails[0].invoiceId);
                    let cmId = cmObj.save();
                    if(cmId){
                        log.debug('CM Linked With Subscription Invoice',cmId);
                    }
                }
            }
        }
    } catch (error) {
        log.error('Error : In linkSubscriptionInvoiceOnCM',error);
    }
}

//function to get the invoice by stripe charge
const getInvoiceByStripeChargeId = (stripeChargeId) =>{
    try {
        let invoiceSearchObj = search.create({
            type: "invoice",
            filters:
            [
               ["type","anyof","CustInvc"], 
               "AND", 
               ["custbody_stripe_chargeid","is",stripeChargeId], 
               "AND", 
               ["mainline","is","T"]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "custbody_stripe_chargeid", label: "Stripe ChargeId"})
            ]
        });
        var searchResultCount = invoiceSearchObj.runPaged().count;
        log.debug("Invoice By Stripe Charge Id",searchResultCount);
        let data = [];
        invoiceSearchObj.run().each(function(result){
            data.push({invoiceId:result.id,stripeChargeId:result.getValue('custbody_stripe_chargeid')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Invoice By Stripe Charge Id',error);
        return [];
    }
}