/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Update SO For Repair Orders
 * File Name   : Tonal_Rst_Update_SO_For_Repair_Orders.js
 * Description : This script is used for update SO fields for the Repair Order and invoke MS api with some payload
 * Created On  : 04/01/2024
 * Modification Details: 
 * ***********************************************************/
/**
 * Update Hostory
 * Version          Date            By                  Requested By                Description
 * V1               01/18/2024      Vikash Kumar        Suresh                      Modification as per the jira tecket[ES-3255]
 * V2               01/30/2024      Vikash Kumar        Suresh                      Modification for the unset "SCHEDULED DATE" ,"SCHEDULED ARRIVAL TIME WINDOW" when  "UNSCHEDULED FLAG" is true
 */
let search,https,record;
define(["N/search","N/https","N/record"], main);

function main(searchModule,httpsModule,recordModule) {

   search = searchModule;
   https = httpsModule;
   record = recordModule;

    return {
        put: updateSalesOrderForRepairOrder,
    }
}

const updateSalesOrderForRepairOrder = (context) => {
    try {
        //validate paylaod
        let payload = context;
        log.debug('payload==',payload);
        if(!payload){
            return returnResponse('fail','INVALID_PAYLOAD','','');
        }

        //validate order id
        let orderId = payload.order_id;
        if(!orderId){
            return returnResponse('fail','ORDER_ID_REQ','','');
        }

        let actualDeliveryDate = payload.actual_delivery_date;
        let scheduledDate = payload.scheduled_date;
        let scheduledTimeWindow = payload.scheduled_time_window;
        let unscheduled = payload.unscheduled;
        let serviceCompliationDate =payload.service_completion_date;
        //validate for all atatribute null
        if(!actualDeliveryDate && !scheduledDate && !scheduledTimeWindow && !unscheduled && !serviceCompliationDate){
            return returnResponse('fail','INVALID_ATTRIBUTES_IN_PAYLOAD','','');
        }

        //get order details in NS
        let salesOrderExixts = getOrderDetailsInNS(orderId);
        log.debug('salesOrderExixts=='+salesOrderExixts.length,salesOrderExixts);
        if(salesOrderExixts.length == 0){
            return returnResponse('fail','SALES_ORDER_NOT_AVILABLE_IN_NETSUITE',orderId,'');
        }

        let fieldsUpdatedOnSalesOrder = {};
        if(actualDeliveryDate){
            fieldsUpdatedOnSalesOrder.custbody_tnl_delivered_date = actualDeliveryDate;
        }

        if(scheduledDate){
            let x = scheduledDate.split('-');
            scheduledDate = x[1]+'/'+x[2]+'/'+x[0];
            fieldsUpdatedOnSalesOrder.custbody_tnl_scheduled_date = scheduledDate;
        }

        if(scheduledTimeWindow){
            fieldsUpdatedOnSalesOrder.custbody_tnl_schdld_arrvl_time_window = scheduledTimeWindow;
        }

        if(unscheduled){
           if(unscheduled == 'FALSE'){
                fieldsUpdatedOnSalesOrder.custbody_unscheduled_flag = false;
           }
           else{
                fieldsUpdatedOnSalesOrder.custbody_unscheduled_flag = true;
                fieldsUpdatedOnSalesOrder.custbody_tnl_schdld_arrvl_time_window = '';
                fieldsUpdatedOnSalesOrder.custbody_tnl_scheduled_date = '';
           }
        }

        if(serviceCompliationDate){
            fieldsUpdatedOnSalesOrder.custbody_service_completion_date = serviceCompliationDate;
        }

        //add current date as last update date
        fieldsUpdatedOnSalesOrder.custbody_last_update_date = new Date();

        //blank sf error message
        fieldsUpdatedOnSalesOrder.custbody_sf_error_message = '';

        //blank date send to sf
        fieldsUpdatedOnSalesOrder.custbody_date_sent_to_sf = '';

        log.debug('fieldsUpdatedOnSalesOrder==',fieldsUpdatedOnSalesOrder);

        //update the so
        let id = record.submitFields({
            type: 'salesorder',
            id: salesOrderExixts[0].salesOrderId,
            values: fieldsUpdatedOnSalesOrder
        });

        if(id){
            log.debug('Sales Order Updated Successfully==',id);
            
            return returnResponse('success','',id,'Sales Order Updated Successfully.');
        }
    } catch (error) {
       log.error('Error : In Update Sales Order For Repair',error); 
       return returnResponse('fail',error.message,'','');
    }
}

//function to return the response
const returnResponse = (message,errorMessage,nsSalesOrderId,messageDetail) => {
    let responseObj = {};
    if (message == 'fail') {
        responseObj.success = false;
        responseObj.error = errorMessage;
        responseObj.nsSalesOrderId = "";
    }
    if (message == 'success') {
        responseObj.success = true;
        responseObj.message = messageDetail;
        responseObj.error = "";
        responseObj.nsSalesOrderId = nsSalesOrderId;
    }

    return responseObj;
}

//function to get the sale order details in NS
const getOrderDetailsInNS = (orderNumber) => {
    try {
        let salesorderSearchObj = search.create({
            type: "salesorder",
            filters:
            [
               ["type","anyof","SalesOrd"], 
               "AND", 
               ["poastext","is",orderNumber], 
               "AND", 
               ["mainline","is","T"]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "otherrefnum", label: "PO/Check Number"})
            ]
        });
        let data = [];
        salesorderSearchObj.run().each(function(result){
            data.push({salesOrderId:result.id,poNumber:result.getValue('otherrefnum'),tranId:result.getValue('tranid')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Order Details',error);
        return [];
    }
}