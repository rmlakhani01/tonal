/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Repair Order Upsert MS NS
 * File Name   : Tonal_Rst_Repair_Order_Upsert_MS_NS.js
 * Description : This script is used for sync repair order data to MS for SF sync and update satus back in NS which retrieve from SF 
 * Created On  : 01/18/2024
 * Modification Details: 
 * ***********************************************************/
let search,record;
define(["N/search","N/record"], main);
function main (searchModule,recordModule) {
    try {
        search = searchModule;
        record = recordModule;

        return {
            get: getRepairOrderToSendMuleSoft,
            put: updateSalesForceStausOnRepairOrders
        }
    } catch (error) {
        log.error('Main Exception',error);
        return returnResponse('fail',error.message,'','');
    }
}

const getRepairOrderToSendMuleSoft = (context) => {
    try {
        //get repair order and return response
        let data = getRepaireOrders();
        log.debug('data=='+data.length,data);
        return JSON.stringify(returnResponse('success','',data,'Data Retrevie.'));
    } catch (error) {
        log.error('Erro : In Gte Retair Order To Send MuleSoft',error);
        return JSON.stringify(returnResponse('fail',error.message,'',''));
    }
}

const updateSalesForceStausOnRepairOrders = (context) => {
    try {
        let payload = context;
        log.debug('paylaod==',payload);
        if(!payload){
            return returnResponsePutCall('fail','INVALID_PAYLOAD','','');
        }

        let salesOrderId = payload.nsSalesOrderId;
        if(!salesOrderId){
            return returnResponsePutCall('fail','NETUSITE_SALES_ORDER_REQ','','');
        }

        let sfStatus = payload.salesForceStatus;
        if(!sfStatus){
            return returnResponsePutCall('fail','SALESFORCE_STATUS_REQ','','');
        }

        if(sfStatus == 'success' || sfStatus == 'SUCCESS'){
            let id = record.submitFields({
                type: 'salesorder',
                id: salesOrderId,
                values: {
                    custbody_date_sent_to_sf: new Date(),
                    custbody_sf_error_message:''
                }
            });
            if(id){
                return returnResponsePutCall('success','',salesOrderId,'Sales Order Updated Successfully.');
            }
        }
        else if(sfStatus == 'fail' || sfStatus == 'FAIL'){
            let id = record.submitFields({
                type: 'salesorder',
                id: salesOrderId,
                values: {
                    custbody_date_sent_to_sf: new Date(),
                    custbody_sf_error_message:payload.error
                }
            });

            if(id){
                return returnResponsePutCall('success','',salesOrderId,'Sales Order Updated Unsuccessfully.');
            }
        }
        else{
            return returnResponsePutCall('fail','INVALID_SALESFORCE_STATUS','','');
        }
    } catch (error) {
        log.error('Error : In Update Sales Force Status On Repair Orders',error);
        return returnResponsePutCall('fail',error.message,'','');
    }
}

//function to return the response
const returnResponse = (message,errorMessage,dataDetail,messageDetail) => {
    let responseObj = {};
    if (message == 'fail') {
        responseObj.success = false;
        responseObj.error = errorMessage;
        responseObj.data = [];
    }
    if (message == 'success') {
        responseObj.success = true;
        responseObj.message = messageDetail;
        responseObj.error = "";
        responseObj.data = dataDetail;
    }

    return responseObj;
}

//function to return the response
const returnResponsePutCall = (message,errorMessage,nsSalesOrderId,messageDetail) => {
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


//function to get the repair order send to mulesoft
const getRepaireOrders = () => {
    try {
        var salesorderSearchObj = search.create({
            type: "salesorder",
            filters:
            [
               ["type","anyof","SalesOrd"], 
               "AND", 
               ["mainline","is","T"], 
               "AND", 
               ["custbody_last_update_date","isnotempty",""], 
               "AND", 
               ["custbody_date_sent_to_sf","isempty",""]
            ],
            columns:
            [
               search.createColumn({name: "otherrefnum", label: "PO/Check Number"}),
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "custbody_tnl_delivered_date", label: "Delivered Date"}),
               search.createColumn({name: "custbody_tnl_scheduled_date", label: "Scheduled Date"}),
               search.createColumn({name: "custbody_tnl_schdld_arrvl_time_window", label: "Scheduled Arrival Time Window"}),
               //search.createColumn({name: "custbody_tnl_rescheduled_date", label: "ReScheduled Date"}),
               search.createColumn({name: "custbody_unscheduled_flag", label: "Unscheduled Flag"}),
               search.createColumn({name: "custbody_service_completion_date", label: "Service Completion Date"}),
               search.createColumn({name: "custbody_date_sent_to_sf", label: "Date Sent to SalesForce"}),
               search.createColumn({name: "custbody_sf_error_message", label: "SF Error Message"}),
               search.createColumn({name: "custbody_last_update_date", label: "LAST UPDATE DATE"})
            ]
        });
        var searchResultCount = salesorderSearchObj.runPaged().count;
        log.debug("Repair Order Count",searchResultCount);
        let resultSetData = salesorderSearchObj.run();
        let currentRange = resultSetData.getRange({
            start : 0,
            end : 1000
        });

        let i = 0;  // iterator for all search results
        let j = 0;  // iterator for current result range 0..999

        let data = [];
        while (j < currentRange.length) {
            // take the result row
            let result = currentRange[j];
            // and use it like this....
            data.push({
                nsSalesOrderId:result.id,
                nsTransactionId:result.getValue('otherrefnum')||'',
                deliveryDate:result.getValue('custbody_tnl_delivered_date')||'',
                scheduledDate:result.getValue('custbody_tnl_scheduled_date')||'',
                scheduledArrivalTimeWindow:result.getValue('custbody_tnl_schdld_arrvl_time_window')||'',
                //rescheduledDate:result.getValue('custbody_tnl_rescheduled_date')||'',
                unscheduledFlag:result.getValue('custbody_unscheduled_flag')||'',
                serviceCompletionDate:result.getValue('custbody_service_completion_date')||'',
                dateSenttoSalesForce:result.getValue('custbody_date_sent_to_sf')||'',
                sfErrorMessage:result.getValue('custbody_sf_error_message')||'',
                lastUpdateDate:result.getValue('custbody_last_update_date')||''
            });

            // finally:
            i++; j++;
            if(j == 1000 ) {   // check if it reaches 1000
                j = 0;          // reset j an reload the next portion
                currentRange = resultSetData.getRange({
                    start : i,
                    end : i + 1000
                });
            }
        }
        return data;
        
    } catch (error) {
        log.error('Error : In Gte Repair Orders',error);
        return [];
    }
}