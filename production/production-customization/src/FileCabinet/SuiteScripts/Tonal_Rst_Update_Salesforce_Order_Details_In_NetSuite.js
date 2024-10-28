/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet
 * Script Name : Tonal Rst Update Salesforce Order Details In NetSuite
 * File Name   : Tonal_Rst_Update_Salesforce_Order_Details_In_NetSuite.js
 * Description : This script is used for update SlaesForce order details in NetSuite Sales Order
 * Created On  : 20/07/2023
 * Modification Details:  
 * ----Date----                ----Modified By----            ----Description----
 *
 ************************************************************/
define(["N/record","N/search"], function(record,search) {

    function updateSalesForceOrderDetails(context) {
        try {
            var payload = context;
            log.debug('payload==',payload);
            if(!payload){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'INVALID_PAYLOAD',
                        message:'Please provide data for order update.'
                    }
                };
            }

            //validated for the NS Order Id
            var nsOrderId = payload.netSuiteSalesOrderId;
            if(!nsOrderId){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'MISSING_NETSUITE_ORDER_ID',
                        message:'Please provide NetSuite order id for update.',
                        netSuiteSalesOrderId:nsOrderId
                    }
                };
            }

            //validate for SF Order Id
            var sfOrderId = payload.salesforceOrderId;
            if(!sfOrderId){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'MISISNG_SALESFORCE_ORDER_ID',
                        message:'Please provide SalesForce order id for order update.',
                        salesforceOrderId:sfOrderId
                    }
                };
            }

            //get the sales order by id in NetSuite for stamping all the details from SF
            var nsOrder = getNetSuiteOrderById(nsOrderId);
            log.debug('nsOrder==',nsOrder);

            //fail
            if(typeof(nsOrder) == 'boolean'){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'SALES_ORDER_NOT_AVILABLE',
                        message:'Sales Order not avilable in NetSuite.',
                        netSuiteSalesOrderId:nsOrderId
                    }
                };
            }

            var sfLineDetails = payload.salesforceLines;
            log.debug('sfLineDetails=='+sfLineDetails.length,sfLineDetails);

            //success, load the record and update the line item with SF line order item id and satmp SF order id
            var soObj = record.load({
                type: record.Type.SALES_ORDER,
                id: nsOrder,
                isDynamic: true
            });

            var soLineCount = soObj.getLineCount({
                sublistId: 'item'
            });

            for(var l = 0 ; l < soLineCount ; l++){
                soObj.selectLine({
                    sublistId: 'item',
                    line: l
                });

                //check SF line is crerated/updated successfully . If Sucess stamp the sfline id with message, else only stamp messsage
                let sfupserted = sfLineDetails[l].Success;
                if(sfupserted == true){
                    //SF line item id
                    soObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_tnl_sf_line_itemid',
                        value: sfLineDetails[l].Id
                    });

                    //SF upserted
                    soObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_tnl_sf_line_upserted',
                        value: sfLineDetails[l].Success
                    });
                }

                //SF line message 
                soObj.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_tnl_sf_line_message',
                    value: sfLineDetails[l].Message
                });

                soObj.commitLine({
                    sublistId:'item'
                });
            }

            //set sf order id
            soObj.setValue('custbody_tnl_sf_orderid',sfOrderId);

            var NSORDERID = soObj.save();
            if(NSORDERID){
                log.debug('SALES ORDER UPDATED WITH SF DETAILS',NSORDERID);
                return {
                    status:1,
                    message:'success',
                    details:{
                        data:payload
                    }
                };
            }

        } catch (error) {
            log.error('Main Exception',error);
            return {
                status:0,
                message:'fail',
                details:{
                    error:error.name,
                    message:error.message,
                    netSuiteSalesOrderId:payload.netSuiteSalesOrderId,
                    salesforceOrderId:payload.salesforceOrderId
                }
            }
        }
    }

    //function to get the Sales Order By Id
    function getNetSuiteOrderById(internalId){
        try {
            var salesorderSearchObj = search.create({
                type: "salesorder",
                filters:
                [
                   ["type","anyof","SalesOrd"], 
                   "AND", 
                   ["mainline","is","T"], 
                   "AND", 
                   ["cogs","is","F"], 
                   "AND", 
                   ["shipping","is","F"], 
                   "AND", 
                   ["internalid","anyof",internalId]
                ],
                columns:
                [
                   search.createColumn({name: "tranid", label: "Document Number"}),
                   search.createColumn({
                      name: "trandate",
                      sort: search.Sort.DESC,
                      label: "Date"
                   })
                ]
            });
            var searchResultCount = salesorderSearchObj.runPaged().count;
            log.debug("Sales Order Count",searchResultCount);
            var orderId = false;
            salesorderSearchObj.run().each(function(result){
                orderId = result.id;
                return true;
            });
            return Number(orderId);
        } catch (error) {
            log.error('Error : In Get NetSUite Order By Id',error);
            return false;
        }
    }

    return {
        post: updateSalesForceOrderDetails
    }
});
