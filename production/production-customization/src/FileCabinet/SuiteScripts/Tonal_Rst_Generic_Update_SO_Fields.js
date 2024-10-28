/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Generic Update SO Fields
 * File Name   : Tonal_Rst_Generic_Update_SO_Fields.js
 * Description : This script is used for update sales order fields for extend warranty phase2
 * Created On  : 08/02/2024
 * Modification Details:  
 * ************************************************************/
/**
 * Update History
 * Version              Date                By              Requested By                    Description
 * V1                   04/05/2024          Vikash          Joanna                          Modification for the payload attributes set which will be NS field id except externalid attribute in payload
 * V2                   08/05/2024          Vikash          Joanna                          Modification for the set more fields on sales order , if more fields where come in payload request
 */
let search,record;
define(["N/search","N/record"], main);
function main(searchModule,recordModule) {
    try {
        search = searchModule;
        record = recordModule;

        return {
            post: updateSalesOrderFields
        }
    } catch (error) {
        log.error('Main Exception',error);
        return returnResponse('fail',error.message,'');
    }
}

const updateSalesOrderFields = (context) => {
    try {
        let payload = context;
        log.debug('payload==',payload);
        if(!payload){
            return returnResponse('fail','INVALID_PAYLOAD','');
        }
        let externalId = payload.externalid;
        if(!externalId){
            return returnResponse('fail','EXTERNALID_REQ','');
        }
        //get the sales order by externalid
        let salesOrderDetails = getSalesOrderByExternalId(externalId);
        log.debug('salesOrderDetails=='+salesOrderDetails.length,salesOrderDetails);
        if(salesOrderDetails.length == 0 || salesOrderDetails.length > 1){
            return returnResponse('fail','SALES_ORDER_NOT_FOUND_BY_EXTERNALID_'+externalId,'');
        }

        let anyfieldUpdated = false;
       
        let soObj = record.load({
            type: 'salesorder',
            id: salesOrderDetails[0].salesOrderId,
            isDynamic: true
        });

        //iterate over the attribute and check the field id not externalid then set the field values on Sales Order
        for (const key in payload) {
            if (payload.hasOwnProperty(key)) {
                log.debug(`key-->${key}`,`value-->${payload[key]}`);
                if(key != 'externalid'){
                    soObj.setValue(key,payload[key]);
                    anyfieldUpdated = true;
                }
            }
        }
        log.debug('anyfieldUpdated==',anyfieldUpdated);
        if(anyfieldUpdated == true){
            let id = soObj.save();
            if(id){
                log.debug('Sales Order Updated Successfully!!',id);
                return returnResponse('success','','');
            }
        }
        else{
            return returnResponse('fail','NO_FIELDS_UDPAED_ON_SALES_ORDER','');
        }
    } catch (error) {
        log.error('Error : In Update Sales Order Fields',error);
        return returnResponse('fail',error.message,'');
    }
}

//function to return response
const returnResponse = (status,message,salesOrderId) =>{
    let response = {};
    if(status == 'success'){
        response.status = status;
    }
    if(status == 'fail'){
        response.status = status;
        response.message = message;
    }
    return response;
}

//function to get the salesorderr by externalid
const getSalesOrderByExternalId = (externalId) => {
    try {
        var salesorderSearchObj = search.create({
            type: "salesorder",
            filters:
            [
               ["type","anyof","SalesOrd"], 
               "AND", 
               ["mainline","is","T"], 
               "AND", 
               ["externalid","anyof",externalId]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "externalid", label: "External ID"})
            ]
        });
        var searchResultCount = salesorderSearchObj.runPaged().count;
        log.debug("Sales Order Count By ExternalId",searchResultCount);
        let data = [];
        salesorderSearchObj.run().each(function(result){
            data.push({salesOrderId:result.id,externalId:result.getValue('externalid'),tranId:result.getValue('tranid')})
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Sale Order By ExternalId',error);
        return [];
    }
}