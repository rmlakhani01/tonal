/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet
 * Script Name : Tonal Rst BBY Update Salesforce Order Details In NetSuite
 * File Name   : Tonal_Rst_BBY_Update_Salesforce_Order_Details_In_NetSuite.js
 * Description : This script is used for update SlaesForce order details in NetSuite BBY Sales Order
 * Created On  : 27/11/2023
 * Modification Details:  
 ************************************************************/
let record,search;
define(["N/record","N/search"], main);
function main (recordModule,searchModuel) {

    record = recordModule;
    search = searchModuel;

    return {
        post: updateSalesForceOrderDetailsForBBYOrders
    }
}

const updateSalesForceOrderDetailsForBBYOrders = (context) => {
    try {
        const payloadObj = context;
        log.debug('payload==',payloadObj);
        if(!payloadObj){
            return returnResponse(0,'fail',{error:'INVALID_PAYLOAD',message:'Please provide data for order update.'});
        }

        /* let paylaodCount = payloadObj.length;
        if(paylaodCount == 0){
            return returnResponse(0,'fail',{error:'NO_DATA',message:'Please provide data for order update.'});
        } */

        /* const payload = payloadObj[0]; */
        const payload = payloadObj

        //validated for the NS Order Id
        let nsOrderId = payload.netSuiteOrderId;
        if(!nsOrderId){
            return returnResponse(0,'fail',{error:'MISSING_NETSUITE_ORDER_ID',message:'Please provide NetSuite order id for update.',netSuiteSalesOrderId:nsOrderId});
        }

        let success = payload.success;

        //validate for SF Order Id
        let sfOrderId = payload.salesforceOrderId;
        if(!sfOrderId && success == true){
            return returnResponse(0,'fail',{error:'MISISNG_SALESFORCE_ORDER_ID',message:'Please provide SalesForce order id for order update.',salesforceOrderId:sfOrderId});
        }

        //get the sales order by id in NetSuite for stamping all the details from SF
        var nsOrder = getNetSuiteOrderById(nsOrderId);
        log.debug('nsOrder==',nsOrder);

        //fail
        if(typeof(nsOrder) == 'boolean'){
            return returnResponse(0,'fail',{error:'SALES_ORDER_NOT_AVILABLE',message:'Sales Order not avilable in NetSuite.',netSuiteSalesOrderId:nsOrderId});
        }
        //success
    
        let fldValues = {};
        if(success == true){
            fldValues.custbody_tnl_so_export_to_mulesoft = true;
            fldValues.custbody_tnl_sf_orderid = sfOrderId;
            fldValues.custbody_tnl_ms_error_details = '';
        }
        else if(success == false){
            fldValues.custbody_tnl_ms_error_details = payload.errorMessage;
        }

        let NSORDERID = record.submitFields({
            type: 'salesorder',
            id: nsOrderId,
            values: fldValues
        });

        if(NSORDERID){
            log.debug('SALES ORDER UPDATED WITH SF DETAILS',NSORDERID);
            return returnResponse(1,'success',payload);
        }

    } catch (error) {
        log.error('Main Exception',error);
        return returnResponse(0,'fail',{error:error.name,message:error.message,netSuiteSalesOrderId:payload.netSuiteSalesOrderId,salesforceOrderId:payload.salesforceOrderId});
    }
}

//function to get the Sales Order By Id
const getNetSuiteOrderById = (internalId) => {
    try {
        let salesorderSearchObj = search.create({
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
        let searchResultCount = salesorderSearchObj.runPaged().count;
        log.debug("Sales Order Count",searchResultCount);
        let orderId = false;
        salesorderSearchObj.run().each(function(result){
            orderId = result.id;
            return true;
        });
        return Number(orderId);
    } catch (error) {
        log.error('Error : In Get NetSuite Order By Id',error);
        return false;
    }
}

//function to return the response
const returnResponse = (status,errorMessage,data) => {
    let responseObj = {};
    if(status == 0){
        responseObj.status = status;
        responseObj.message = errorMessage;
        responseObj.details = data;
    }
    if(status == 1){
        responseObj.status = status;
        responseObj.message = errorMessage;
        responseObj.details = data;
    }
    return responseObj;
}