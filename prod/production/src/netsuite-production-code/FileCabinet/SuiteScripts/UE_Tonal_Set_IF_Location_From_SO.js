/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
/*************************************************************
* File Header
* Script Type: User Event Script
* Script Name: UE Tonal Set IF Location From SO
* File Name  : UE_Tonal_Set_IF_Location_From_SO.js
* Created On : 30/09/2022
* Modified On: 
* Created By : Vikash Kumar (Yantra Inc.)
* Modified By: 
* Description: This is used for setting the "sales order location" on IF only header field in context of UI only
************************************************************/
define(["N/runtime","N/search"], function(runtime,search) {

    function setIFSalesOrderLocation(context) {
        try {
            log.debug('contextType==',context.type);
            log.debug('runtimeExecutionContext==',runtime.executionContext);
            log.debug('recordtype===',context.newRecord.type);
            if((context.type == 'create' || context.type == 'edit') && (runtime.executionContext != runtime.ContextType.MAP_REDUCE)){
                var recordType = context.newRecord.type;
                if(recordType == 'itemfulfillment'){
                    var ifObj = context.newRecord;

                    var createdFrom = ifObj.getValue('createdfrom');

                    var createdFromText = ifObj.getText('createdfrom');

                    log.debug('createdFrom=='+createdFrom,'createdFromText=='+createdFromText);

                    var cf = createdFromText.split('#')[0].trim();

                    if(createdFrom && cf == 'Sales Order'){
                        var salesObj = search.lookupFields({
                            type: search.Type.SALES_ORDER,
                            id: createdFrom,
                            columns: ['location']
                        });

                        log.debug('salesObj==',JSON.stringify(salesObj));

                        var salesLocationId = '';

                        if(salesObj.location.length > 0){
                            salesLocationId = salesObj.location[0].value;
                        }

                        log.debug('salesLocationId==',salesLocationId);

                        ifObj.setValue('custbody_sales_order_location',salesLocationId);

                        // ifObj.setValue('custbody_sales_order_locations',salesLocationId);
                    }
                    else{
                        log.debug('CreatedFrom Is Not Matching', 'No Action Required');
                    }
                }

                if(recordType == 'itemreceipt'){
                    var irObj = context.newRecord;

                    var createdFrom = irObj.getValue('createdfrom');

                    var createdFromText = irObj.getText('createdfrom');

                    log.debug('createdFrom=='+createdFrom,'createdFromText=='+createdFromText);

                    var cf = createdFromText.split('#')[0].trim();

                    if(createdFrom && cf == 'Return Authorization'){
                        var rmaObj = search.lookupFields({
                            type: search.Type.RETURN_AUTHORIZATION,
                            id: createdFrom,
                            columns: ['location']
                        });

                        log.debug('rmaObj==',JSON.stringify(rmaObj));

                        var salesLocationId = '';

                        if(rmaObj.location.length > 0){
                            salesLocationId = rmaObj.location[0].value;
                        }

                        log.debug('salesLocationId==',salesLocationId);

                        irObj.setValue('custbody_sales_order_location',salesLocationId);

                        // irObj.setValue('custbody_sales_order_locations',salesLocationId);
                    }
                    else{
                        log.debug('CreatedFrom Is Not Matching', 'No Action Required');
                    }
                } 
            }
            else{
                log.debug('Context Type=='+context.type,'Execution Context=='+runtime.executionContext+'Is Different No Need Any Action');
            }
        } catch (error) {
            log.error('Error : In setIFSalesOrderLocation',error);
        }
    }

    return {
        beforeSubmit: setIFSalesOrderLocation
    }
});