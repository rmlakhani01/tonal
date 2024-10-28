/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR SFE Parent Order Process
 * File Name   : Tonal_MR_SFE_Parent_Order_Process.js
 * Description : This script is used for create/update SFE parent sales order in NS.
 * Date: 27/09/2024
 * ************************************************************/
//1. get the data from the sales order for parent order process
//2. check parent order not exists in NS,  create new one with fixed customer, item, amount, qty, rate and update parnet order with child sales order line item(fixed one) and alos update child sales order with parent refrence
//3. if parent order exists in NS, then update that parent order with the child line item(fixed one) details and also update child sales order with parent detaila
let search,record,runtime;
define(["N/search","N/record","N/runtime"], main);
function main(searchModule,recordModule,runtimeModule) {
    search = searchModule;
    record = recordModule;
    runtime = runtimeModule;
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
}

const getInputData = () => {
    try {
        //get the saved search data, item from the script parameter
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_sdf_child_orders');
        let parentItem = scriptObj.getParameter('custscript_sdf_parent_ord_item');
        let parentItemRate = scriptObj.getParameter('custscript_sdf_parent_ord_item_rate');
        let parentItemAmt = scriptObj.getParameter('custscript_sdf_parent_ord_item_amt');
        let parentCustomer = scriptObj.getParameter('custscript_parent_customer');
        if(!ssId || !parentItem || !parentItemRate || !parentItemAmt || !parentCustomer){
            log.debug('NO_ACTION_PARAMS_MISSING',JSON.stringify({ssId:ssId,parentItem:parentItem,parentItemAmt:parentItemAmt,parentItemRate:parentItemRate,parentCustomer:parentCustomer}));
            return [];
        }

        let data = getDataForParentOrderPorcess(ssId,parentItem,parentItemRate,parentItemAmt,parentCustomer);
        return data;
        
    } catch (error) {
        log.error('Error : In Get Input Stage',error);
        return [];
    }
}

const map = (context) => {
    let key,childOrderData;
    try {
        // log.debug('mapContext==',context);
        childOrderData = JSON.parse(context.value);
        key = context.key;
        // let childSoId = childOrderData.childSalesOrderId;
        let childLineItems = childOrderData.items;
        let parentSoId = childOrderData.parentOrderId;
        let childSoIds = [];

        //load the parent order and add line items of child 
        let parentSoObj = record.load({
            type: record.Type.SALES_ORDER,
            id: parentSoId,
            isDynamic: true
        });

        let lineCount = parentSoObj.getLineCount('item'),removeLines = [],parentItemRemovedFromLine = false;

        //check parent line is removed
        let parentItemRemoved = childOrderData.parentItemRemoved;
        log.debug('parentItemRemoved==',parentItemRemoved);

        //loop over the the existing lines and check where child sales order coloumn is blank, remove that line and make body flag parent item line removed true
        if(parentItemRemoved == false){
            for(let el = 0 ; el < lineCount ; el++){
                parentSoObj.selectLine('item',el);
    
                //child so column
                if(!parentSoObj.getCurrentSublistValue('item','custcol_child_sales_order')){
                    removeLines.push({
                        lineIndex:el
                    });
                }
            }
    
            //remove the line item which doesn't have child order detail
            for(let r = removeLines.length-1 ; r >= 0 ; r--){
                parentSoObj.removeLine({
                    sublistId: 'item',
                    line: removeLines[r].lineIndex,
                });
                // log.debug('Line Remove==',removeLines[r].lineIndex);
                parentItemRemovedFromLine = true;
            }
        }

        //loop over the child items add add on parent
        for(let l in childLineItems){
            parentSoObj.selectNewLine({
                sublistId: 'item'
            });

            //item
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: childLineItems[l].actualChildItemId
            });

            //description
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'description',
                value: childLineItems[l].description
            });

            //qty
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                value: Number(1)
            });

            //rate
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'rate',
                value: childLineItems[l].rate
            });

            //amount
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: childLineItems[l].amount
            });

            //child so id
            parentSoObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_child_sales_order',
                value: childLineItems[l].childSalesOrderId
            });
    
            childSoIds.push(childLineItems[l].childSalesOrderId);      

            parentSoObj.commitLine({
                sublistId: 'item'
            });
        }

        let psoId = parentSoObj.save();
        if(psoId){
            log.debug('PARENT ORDER UPDATED WITH CHILD ITEMS SUCCESSFULLY!!',psoId);
            let l = [...new Set(childSoIds)]//remove dups
            log.debug('childSoIds=='+l.length,l);
            for(let s in l){
                context.write({key:l[s],value:{data:childOrderData,status:'success',parentSalesOrder:parentSoId}});
            }
        }
    } catch (error) {
        log.error('Error : Map Stage',error);
        context.write({key:key,value:{data:childOrderData,status:'fail',error:error.message}});
    }
}

const reduce = (context) => {
    let key,data;
    try {
        // log.debug('reduceContext==',context);
        //update back child record with parent data
        key = context.key;
        data = JSON.parse(context.values[0]);
        let parentSalesOrder = data.parentSalesOrder;
        let status = data.status;
        //success
        if(status == 'success'){
            let id = record.submitFields({
                type: record.Type.SALES_ORDER,
                id: key,
                values: {
                    custbody_parent_order:parentSalesOrder
                }
            });
            if(id){
                log.debug('CHILD ORDER UPDATED WITH PARENT ORDER DETAILS SUCCESSFULLY!!',id);
                context.write({key:key,value:{data:data,status:'success',parentSalesOrder:parentSalesOrder}});
            }
        }
        else{
            context.write({key:key,value:{data:data,status:'fail'}});
        }
    } catch (error) {
        log.error('Error : In Reduce Stage',error);
        context.write({key:key,value:{data:data,status:'fail',error:error.message}});
    }
}

const summarize = (summary) => {
    try {
        let successData = [],failData = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'SDF',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);

            if (data.status == 'success') {
                successData.push(data);
            }
            if (data.status == 'fail') {
                failData.push(data);
            }
            return true;
        });
        log.debug('successData=='+successData.length,successData);
        log.debug('failData=='+failData.length,failData);
    } catch (error) {
        log.error('Error : In Summarize Stage',error);
    }
}

//funnction to get the current year and month
const getCurrentMonthAndYear = (dateObj) =>{
    let c_year = dateObj.getFullYear();
    let c_month = dateObj.getMonth()+1;
    if(c_month < 10){
        c_month = '0'+c_month;
    }
    return c_year.toString()+c_month.toString();
}

//function to form the data for the parent order process
const getDataForParentOrderPorcess = (ssId,itemId,itemRate,itemAmount,parentCustomerId) => {
    try {
        //load the search data and form the data
        let searchObj = search.load({
            id: ssId
        });
        let resultSet = searchObj.run();
        // now take the first portion of data.
        let currentRange = resultSet.getRange({
            start : 0,
            end : 1000
        });

        //no saved search data return empty array
        if(currentRange.length == 0){
            return [];
        }
        //if saved search data take any index otherrefnum field value to get the prefix of the partner annd form the external id as per the bussiness needs
        let parentSoData = currentRange[0].getValue('otherrefnum');
        let parentExternalId = parentSoData.split('_')[0]+'_'+getCurrentMonthAndYear(new Date());//eg.'SFE_202409'
        log.debug('parentExternalId==',parentExternalId);
        let POSOID,poSOCreated = false,parentItemRemoved = true;

        //check for the parent sales order exists or not in NS
        let parentOrderDetails = getParentSalesOrder(parentExternalId);
        log.debug('parentOrderDetails=='+parentOrderDetails.length,parentOrderDetails);

        //create parent sales order
        if(parentOrderDetails.length == 0){
            POSOID = createParentSalesOrder(parentCustomerId,itemId,itemRate,1,itemAmount,parentExternalId);
            //fialure
            if(POSOID.length == 0){
                poSOCreated = false;
            }
            //success
            else{
                POSOID = POSOID[0];
                poSOCreated = true;
                parentItemRemoved = false;
            }
        }
        //used the existing parent order
        else{
            POSOID = parentOrderDetails[0].salesOrderInternalId;
            poSOCreated = true;
        }

        let data = [];
        //if parent sales order not created
        if(poSOCreated == false){
            return data;
        }

        for(let j in currentRange){
            // take the result row
            let result = currentRange[j];
            //check based on parentorderId is there nay object available in data array, if not create one else just append lines to the parent one
            let index = data.findIndex(function(obj){
                return obj.parentOrderExternalId == parentExternalId/* 'SFE_202409' */
            });

            let objLine = {childSalesOrderId:result.id,/* childOrderItemId:result.getValue(''), */actualChildItemId:itemId,rate:itemRate,amount:itemAmount,description:result.getValue('memo')};

            let obj = {
                parentOrderId:POSOID,
                parentOrderExternalId:parentExternalId,
                parentItemRemoved: parentItemRemoved,
                // childSalesOrderId:result.id,
                // description:result.getValue('memo'),
                items:[objLine]
            }

            //create new object
            if(index == -1){
                data.push(obj);
            }
            //add line details on existing one
            else{
                data[index].items.push(objLine);
            }
        }
        log.debug('data=='+data.length,data);
        return data;
    } catch (error) {
        log.error('Error : In Get Date For Parent Order Process',error);
        return [];
    }
}

//function to create the parent order
const createParentSalesOrder = (customerId,itemId,rate,quantity,amount,externalID) => {
    try {
        let soObj = record.create({
            type: record.Type.SALES_ORDER,
            isDynamic: true
        });

        //set the custom form
        // soObj.setValue('customform','');

        //set the customer
        soObj.setValue('entity',customerId);

        let uniqueId = externalID;

        //set externalid
        soObj.setValue('externalid',uniqueId);

        //set po#
        soObj.setValue('otherrefnum',uniqueId);

        //set OrderType to 8-Supplier Direct Fulfillment
        soObj.setValue('custbody_jaz_ordertype', '8')

        //set memo
        soObj.setValue('memo',uniqueId);

        //set tran date
        soObj.setValue('trandate',new Date());

        //set saleseffective date
        soObj.setValue('saleseffectivedate',new Date());

        //set woocom id
        soObj.setValue('custbody3',uniqueId);

        //items
        //select new line on so
        soObj.selectNewLine('item');

        //set item
        soObj.setCurrentSublistValue('item','item',Number(itemId.trim()));

        //set rate
        soObj.setCurrentSublistValue('item','rate',rate);

        //set quantity
        soObj.setCurrentSublistValue('item','quantity',quantity);

        //set amount
        soObj.setCurrentSublistValue('item','amount',amount);

        soObj.commitLine('item');
       
        let soId = soObj.save();
        if(soId){
            log.debug('New Parent Sales Order Created',soId);
            return [soId];
        }
    } catch (error) {
        log.error('Error : In Create Parent Sales Order',error);
        return [];
    }
}

//function to get the parent order by externalId
const getParentSalesOrder = (externalId) => {
    try {
        let salesorderSearchObj = search.create({
            type: "salesorder",
            filters:
            [
               ["type","anyof","SalesOrd"], 
               "AND", 
               ["externalid","is",externalId], 
               "AND", 
               ["mainline","is","T"]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "otherrefnum", label: "PO/Check Number"}),
               search.createColumn({name: "externalid", label: "External Id"})
            ]
        });
        let dataObj = [];
        salesorderSearchObj.run().each(function(result){
            dataObj.push({salesOrderInternalId:result.id,externalId:result.getValue('externalid'),tranid:result.getValue('tranid')});
            return true;
        });
        return dataObj;
    } catch (error) {
        log.error('Error : In Get Parent Sales Order',error);
        return [];
    }
}