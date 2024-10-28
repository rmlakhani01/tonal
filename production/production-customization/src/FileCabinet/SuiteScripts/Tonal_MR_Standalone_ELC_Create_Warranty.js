/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Standalone ELC Create Warranty
 * File Name   : Tonal_MR_Standalone_ELC_Create_Warranty.js
 * Description : This script is used for create warranty record for stnadalone Extend Lead Conversions.
 * Created On  : 06/11/2023
 * Modification Details:  
 ************************************************************/
/**
 * Update History
 * Version          Instance            By              Date            Requested By                Description
 * V1               SB2                 Vikash          09/11/2023                                  Modification for the removal of uncessary code and logs commentd
 * V2               SB2                 Vikash          14/11/2023      Joanna                      Modifcation for the date issue as per the jira ticket [ES-3107]
 *                                                                                                  Added 'moment.js' library to acheive this. File Location will be 'SuiteScripts/moment.mimn.js
 * V3               SB2                 Vikash          15/11/2023                                  Got issue for the dates caluclation due to not correct format of date paased in the function of 'addYearsInDate' and 'addDaysInDate'
 */
let search,runtime,record,format,moment;
let dataItems = [],dataInventory = [];//these variabels will store data for the warranty items

define(['N/search', 'N/runtime', 'N/record','N/format','./moment.min.js'],  main);

function main (searchModule, runtimeModule, recordModule, formatModule, momentModule) {

    search = searchModule;
    runtime = runtimeModule;
	record = recordModule;
    format = formatModule;
    moment = momentModule;

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
}

const getInputData = () => {
    try {
        //get the data from the script parameter
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_extend_slc_warranty');
        let defaultDate = scriptObj.getParameter('custscript_dd');
        let extendWarrantyItems = scriptObj.getParameter('custscript_ext_warranty_item');
        let repairedItem = scriptObj.getParameter('custscript_rep_item');
        let replacedItem = scriptObj.getParameter('custscript_repl_item');
        log.debug('scriptparams==',JSON.stringify({ssId:ssId,defaultDate:defaultDate,extendWarrantyItems:extendWarrantyItems,repairedItem:repairedItem,replacedItem:replacedItem}));
        if(!ssId || ! defaultDate || !extendWarrantyItems || !repairedItem || !replacedItem){
            return [];
        }

        let searchObj  = search.load({
            id: ssId
        });

        let searchData = searchObj.run();

        let resultSet = searchData.getRange(0,1000)|| [];

        return resultSet;
    } catch (error) {
        log.error('Error : In Get Input Satge',error);
        return [];
    } 
}

const map = (context) => {
    try {
        // log.debug('mapContext==',context);
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_extend_slc_warranty');
        let defaultDate = scriptObj.getParameter('custscript_dd');
        let defaultWarrantyItems = scriptObj.getParameter('custscript_ext_warranty_item');
        let repairedItem = scriptObj.getParameter('custscript_rep_item');
        let replacedItem = scriptObj.getParameter('custscript_repl_item');
        let data = JSON.parse(context.value);

        //validate for the Get transaction internal ID where:

        /* 1. Extend Lead Token field = extendLeadToken

        2. Internal ID does not equal internal ID
        
        Using the internal ID, create the Warranty records for Extended Warranty */

        let recId = data.id;
        let extendLeadtoken = data.values.custbody_extend_lead_token;

        let salesData = getSalesOrder(recId,extendLeadtoken);
        log.debug('salesData=='+salesData.length,salesData);

        if(salesData.length == 0){
            context.write({key:recId,value:{statsu:false}});
            return;
        }

        let salesObj = record.load({
            type: 'salesorder',
            id: salesData[0].salesOrderInternalid,
            isDynamic: true
        });

        let salesStatus = salesData[0].salesOrderStatus;
        
        //validate for the order type is "In Warranty Claim Order - 4" or "Out of Warranty Order - 5"
        let orderType = salesObj.getValue('custbody_jaz_ordertype');
        let orderTypeText = salesObj.getValue('custbody_jaz_ordertype');
        log.debug('orderType==',orderTypeText);
        
        //get the item detail which contains "150-0016" and order status is not "in warranty claim order"(4) then create warranty object/record
        let replacedSkuLine = salesObj.findSublistLineWithValue({
            sublistId: 'item',
            fieldId: 'item',
            value: replacedItem
        });
        log.debug('replacedSkuLine==',replacedSkuLine);

        if(orderType == 4 && replacedSkuLine > -1){
            log.debug('NO_ACTION','IN_WARRANTY_CLAIM_ORDER_WITH_150_0016_ITEM');
            context.write({key:recId,value:{statsu:false}});
            return;
        }

        if(orderType == 4){
            log.debug('NO_ACTION','IN_WARRANTY_CLAIM_ORDER');
            context.write({key:recId,value:{statsu:false}});
            return;
        }

        //validate order contains replaced/repaired items line
        let replacedItemAvilable = false, repairedItemAvilable = false;
        let itemIdReplaced = salesObj.findSublistLineWithValue({
            sublistId: 'item',
            fieldId: 'item',
            value: replacedItem
        });

        let itemIdRepaired = salesObj.findSublistLineWithValue({
            sublistId: 'item',
            fieldId: 'item',
            value: repairedItem
        });

        if(itemIdReplaced > -1){
            replacedItemAvilable = true;
        }
        if(itemIdRepaired > -1){
            replacedItemAvilable = true;
        }
        log.debug('replacedItemAvilable=='+replacedItemAvilable,'repairedItemAvilable=='+repairedItemAvilable);
        
        log.debug('defaultWarrantyItems', defaultWarrantyItems);
        
        //push warranty item in list
        let arrWarrantyItems = [];
        if(defaultWarrantyItems.indexOf(",") > -1){
            arrWarrantyItems = defaultWarrantyItems.split(",");
        }else{
            arrWarrantyItems.push(defaultWarrantyItems);
        }
        log.debug("arrWarrantyItems", arrWarrantyItems);
        
        let isExtWarrantyExists = false;

        //check for the warranty item avilable on so line 
        if(arrWarrantyItems.length > 0){
            for(let index = 0; index < arrWarrantyItems.length; ++index){
                
                let lineNumber = salesObj.findSublistLineWithValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    value: arrWarrantyItems[index]
                });
                if(lineNumber > -1){
                    isExtWarrantyExists = true;
                    break;
                }
            }
        }
        log.debug("isExtWarrantyExists", isExtWarrantyExists);

        context.write({key:recId,value:{status:true,salesOrderStatus:salesStatus,originalSalesOrderId:salesData[0].salesOrderInternalid,repairedItem:repairedItem,replacedItem:replacedItem,isExtWarrantyExists:isExtWarrantyExists,replacedItemAvilable:replacedItemAvilable,repairedItemAvilable:repairedItemAvilable,salesObject:salesObj}});
    } catch (error) {
        log.error('Error : In Get Map Stage',error);
    }
}

const reduce = (context) => {
    try {
        // log.debug('reduceContext==',context);
        dataItems = [],dataInventory = [];
        let data = JSON.parse(context.values[0]);
        let soId = data.originalSalesOrderId;
        let extendOrderId = JSON.parse(context.key);
        let repairedItem = data.repairedItem;
        let replacedItem = data.replacedItem;
        let isExtWarrantyExists = data.isExtWarrantyExists;
        let repairedItemAvilable = data.repairedItemAvilable;
        let replacedItemAvilable = data.repairedItemAvilable;
        let recordId = data.originalSalesOrderId;

        let scriptObj = runtime.getCurrentScript();
        let fourYearExtendedWarrantyItem = scriptObj.getParameter('custscript__4yr_ext_warr_item');
        let fiveYearExtendedWarrantyItem = scriptObj.getParameter('custscript__5yr_ext_warr_item');

        let status = data.status;
        if(status == false){
            context.write({key:extendOrderId,value:{status:status}});
            return;
        }

        let salesStatus = data.salesOrderStatus;

        //load the extend sales order and get the extend product details and other details
        let extendSalesObj = record.load({
            type: 'salesorder',
            id: extendOrderId,
            isDynamic: true
        });

        let extendProducts = [];

        let extendLineCount = extendSalesObj.getLineCount('item');

        for(let e = 0 ; e < extendLineCount ; e++){
            let extendItemIds = extendSalesObj.getSublistValue('item','item',e);
            if(extendItemIds == fourYearExtendedWarrantyItem || extendItemIds == fiveYearExtendedWarrantyItem){
                extendProducts.push({extendItemId:extendSalesObj.getSublistValue('item','item',e),extendItemQuantity:extendSalesObj.getSublistValue('item','quantity',e),rate:extendSalesObj.getSublistValue('item','rate',e)});
            }
        }

        log.debug('extendProducts=='+extendProducts.length,extendProducts);

        let extendContractToken = extendSalesObj.getValue('custbody_extended_contract_id');

        let extendOrderDate = extendSalesObj.getText('trandate');

        log.debug('extendContractToken=='+extendContractToken,'extendOrderDate=='+extendOrderDate+'TrainerOrderStatus=='+salesStatus);

        //case 1 : sales order status pending fulfilment
        //add the extend order product on original so
        if(salesStatus == 'pendingFulfillment'|| salesStatus=='pendingApproval'){
            let extendedPorductUpdatedOnOrigianlSalesOrder = setExtendProductOnOrigianlSaleOrder(soId,extendProducts,extendContractToken);
            if(typeof(extendedPorductUpdatedOnOrigianlSalesOrder) == 'number'){
                //set  EXTENDED LEAD CONVERSION COMPLETED
                extendSalesObj.setValue('custbody_lead_conversion_completed',true);
                let extendSalesOrderId = extendSalesObj.save();
                context.write({key:extendOrderId,value:{status:true,extendedProductAdded:true,warrantyRecordIds:[]}});
            }
            else{
                context.write({key:extendOrderId,value:{status:false,extendedProductAdded:false,warrantyRecordIds:[]}});
            }
        }

        //case 2 : sales order status pending billing or closed
        //add the extend order product on original so
        //add warranty record on origianl so
        //set activation date as extend order data on warranty
        //populate other dates as required on warranty(NOTE- Needs to modify warranty creation logic for extend line avilable on so, because its' adding two warranty record which is standard and extended here we need to add only extended warranty record)
        if(salesStatus == 'pendingBilling' || salesStatus == 'fullyBilled' || salesStatus=='closed'){
            let warrantyAddedOnOriginalSalesOrder = addWarrantyRecordOnOriginalSalesOrder(soId,extendProducts,extendContractToken,extendOrderDate,repairedItem,replacedItem,isExtWarrantyExists,repairedItemAvilable,replacedItemAvilable,recordId);
            if(typeof(warrantyAddedOnOriginalSalesOrder) == 'object' && warrantyAddedOnOriginalSalesOrder.error == undefined){
                extendSalesObj.setValue('custbody_lead_conversion_completed',true);
                let extendSalesOrderId = extendSalesObj.save();
                context.write({key:extendOrderId,value:{status:true,extendedProductAdded:true,warrantyRecordIds:warrantyAddedOnOriginalSalesOrder.data}});
            }
            else{
                context.write({key:extendOrderId,value:{status:false,extendedProductAdded:false,warrantyRecordIds:[]}});
            }
        }
        
    } catch (error) {
        log.error('Error : In Reduce Stage',error);
    }
}

const summarize = (summary) => {
    try {
        let successSalesOrdersWarrantyCreated = [], failureSalesOrdersWarrantyNotCreated = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'Warranty Create For Order',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);
            
            if(data.status == true){
                successSalesOrdersWarrantyCreated.push({salesOrderId:key,warrantyData:data.warrantyRecordIds});
            }
            if(data.status == false){
                failureSalesOrdersWarrantyNotCreated.push({salesOrderId:key,warrantyData:data.warrantyRecordIds})
            }
            return true;
        });

        if(successSalesOrdersWarrantyCreated.length > 0){
            for(let s in successSalesOrdersWarrantyCreated){
                record
            }
        }

        log.debug('successSalesOrdersWarrantyCreated=='+successSalesOrdersWarrantyCreated.length,successSalesOrdersWarrantyCreated);
        log.debug('failureSalesOrdersWarrantyNotCreated=='+failureSalesOrdersWarrantyNotCreated.length,failureSalesOrdersWarrantyNotCreated);
    } catch (error) {
        log.error('Error : In Summarize Stage',error);
    }
}

//function to get the sales order for warranty creation
const getSalesOrder = (internalId, extendLeadtoken) => {
    try {
        var salesorderSearchObj = search.create({
            type: "salesorder",
            filters:
            [
               ["type","anyof","SalesOrd"], 
               "AND", 
               ["mainline","is","T"],
               "AND",
               ["custbody_extend_lead_token","is",extendLeadtoken], 
               "AND", 
               ["internalidnumber", "notequalto",Number(internalId)]
            ],
            columns:
            [
               search.createColumn({name: "tranid", label: "Document Number"}),
               search.createColumn({name: "internalid", label: "Internal ID"}),
               search.createColumn({name: "custbody_extend_lead_token", label: "Lead Token"}),
               search.createColumn({name: "statusref", label: "Status"})
            ]
        });
        var searchResultCount = salesorderSearchObj.runPaged().count;
        log.debug("Sales Order For Warranty Count",searchResultCount);
        let data = [];
        salesorderSearchObj.run().each(function(result){
            data.push({salesOrderInternalid:result.id,documentNumber:result.getValue('tranid'),leadToken:result.getValue('custbody_extend_lead_token'),salesOrderStatus:result.getValue('statusref')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Sales Order',error);
        return [];
    }
}

//function to create the warranty record
const createWarrantyRecord = (soId,origianlItemId,warrantyType,warrantyItem,tos,quantity) => {
    try {
        //create # of warranty record based on component's quantity
        let wRecCreated = [];
        for(let i = 0 ; i < quantity ; i++){
            const objWarrantyRec = record.create({
                type: "customrecord_warranty",
            });
            objWarrantyRec.setValue("custrecord_warranty_sales_order", soId);
            objWarrantyRec.setValue("custrecord_warranty_status", 1);
            objWarrantyRec.setValue("custrecord_original_order_line_item", origianlItemId);
            objWarrantyRec.setValue("custrecord_warranty_type", warrantyType);								
            if(warrantyItem)
                objWarrantyRec.setValue("custrecord_warranty_item",warrantyItem);
            else
                objWarrantyRec.setValue("custrecord_warranty_item",origianlItemId);
            if(tos)
                objWarrantyRec.setValue("custrecord_tos_version", tos);
            objWarrantyRec.setValue("custrecord_synced_salesforce", false);
            let newWarrantyRecId = objWarrantyRec.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
            if(newWarrantyRecId	){
                // log.debug("newWarrantyRecId", newWarrantyRecId);
                wRecCreated.push(newWarrantyRecId);
            }
        }
        return wRecCreated;
    } catch (error) {
        log.error('Error : In Create Warranty Record',error);
        return [];
    }
}

//function to get the item components
const getItemComponents = (itemId,mainItem,recursiveCall) => {
    try {
        const itemSearchObj = search.create({
            type: "item",
            filters:
            [
               ["internalid","anyof",itemId], 
               "AND", 
               ["isinactive","is","F"],
               "AND",
               ["memberitem.custitem_warranty_eligible","is","T"]
            ],
            columns:
            [
               search.createColumn({
                  name: "itemid",
                  sort: search.Sort.ASC,
                  label: "Name"
               }),
               search.createColumn({name: "displayname", label: "Display Name"}),
               search.createColumn({name: "salesdescription", label: "Description"}),
               search.createColumn({
                    name: "type",
                    join: "memberItem",
                    label: "Type"
               }),
               search.createColumn({name: "memberitem", label: "Member Item"}),
               search.createColumn({ name: "memberquantity", label: "Mamber Quantity"})
            ]
        });
        let searchResultCount = itemSearchObj.runPaged().count;
        log.debug("Item Components Count For=="+itemId,searchResultCount);
        let data = []
        itemSearchObj.run().each(function(result){
            let main_item = '';
            if(recursiveCall == true){
                main_item = mainItem;
            }
            else{
                main_item = result.id;
            }
            data.push({"item": main_item, "member": result.getValue('memberitem'), "filter": false,"item_type":result.getValue({name: "type",join: "memberItem"}),"memberquantity": result.getValue('memberquantity')});
            return true;
        });
        return data;
    } catch (error) {
        log.error('Error : In Get Item Components',error);
        return [];
    }
}

//function to get the components member details(recursive call)
const getItemDetails = (itemsData) => {
    try {
        for(let d in itemsData){
            let data = getItemComponents(itemsData[d].member,itemsData[d].item,true);
            let filterAssembly = data.filter(function(obj){
                return (obj.item_type == 'Assembly' || obj.item_type == 'Kit');
            });
            // log.debug('filterAssembly==OfRecursive=='+filterAssembly.length,filterAssembly);

            let filterInventory = data.filter(function(obj){
                return (obj.item_type == 'InvtPart');
            });

            // log.debug('filterInventory=OfRecursicve=='+filterInventory.length,filterInventory);

            dataInventory = dataInventory.concat(filterInventory);

            /* if(filterAssembly.length == 0){//Due to this the function was return when Item doesnot have any Assembly item .However the main item coantains assembly item which needs to further check for the recursion
                return;
            } */
            let x = getItemDetails(filterAssembly);
            dataItems = dataItems.concat(x);
        }
    } catch (error) {
        log.error('Error : In Get Items Details',error);
        return [];
    }
}

//function to add extended product line on origianl sales order
const setExtendProductOnOrigianlSaleOrder = (salesOrderInternalId,extendProducts,extendContractToken) => {
    try {
        let soObj = record.load({
            type: 'salesorder',
            id: salesOrderInternalId,
            isDynamic: true
        });

        soObj.setValue('custbody_extended_contract_id',extendContractToken);

        for(let d in extendProducts){
            soObj.selectNewLine({
                sublistId: 'item'
            });

            soObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'item',
                value: extendProducts[d].extendItemId
            });

            soObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                value: 1
            });

            soObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'rate',
                value: 0
            });

            soObj.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'amount',
                value: 0
            });

            soObj.commitLine({
                sublistId: 'item'
            });
        }

        let soId = soObj.save();
        if(soId){
            log.debug('SalesOrder Updated With Extended Product',soId);
            return Number(soId);
        }
    } catch (error) {
        log.error('Error : In Set Extend Product On Sales Order',error);
        return {error:error.message,status:falsa};
    }
}

//function to create warranty, add extend product on original sales order
const addWarrantyRecordOnOriginalSalesOrder = (soId,extendProducts,extendContractToken,extendOrderDate,repairedItem,replacedItem,isExtWarrantyExists,repairedItemAvilable,replacedItemAvilable,recordId) => {
    try {
        let salesObj = record.load({
            type: 'salesorder',
            id: soId,
            isDynamic: true
        });

        let orderType = salesObj.getValue('custbody_jaz_ordertype');
        let orderTypeText = salesObj.getValue('custbody_jaz_ordertype');
        log.debug('orderType==',orderTypeText);

        let soLineCount = salesObj.getLineCount('item');

        let arrItemList = [];
        let itemIds = [];
        //loop over the line and get the sku details for the warranty creation
        //needs to check item is not replace,repaired and itemtype none of 'Service', 'OthCharge', 'Subtotal', 'Payment'
        for(let s = 0 ; s < soLineCount ; s++){
            let itemId = salesObj.getSublistValue('item','item',s);
            let itemType = salesObj.getSublistValue('item','itemtype',s);
            if((itemId != repairedItem && itemId != replacedItem) && (itemType != 'Service' && itemType != 'OthCharge' && itemType != 'Subtotal' && itemType != 'Payment' && itemType != 'InvtPart')){
                let type = '';
                if(itemType == 'Kit'){
                    type = record.Type.KIT_ITEM;
                }
                if(itemType == 'Assembly'){
                    type = record.Type.ASSEMBLY_ITEM;
                }
                
                let itemComponets = getItemComponents(itemId,'',false);
                log.debug('itemComponets==',itemComponets);
                arrItemList = arrItemList.concat(itemComponets);
                itemIds.push(itemId);
            }
            else if(itemId == repairedItem || itemId == replacedItem){
                let itemObj = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['custitem_warranty_eligible']
                });
                log.debug('itemObj==',itemObj);
                if(itemObj.custitem_warranty_eligible == true){
                    arrItemList.push({item: itemId,member: "",filter: false,item_type:'Replace/Repaired'});
                    itemIds.push(itemId);
                }
            }
            else if((itemId != repairedItem || itemId != replacedItem) && itemType == 'InvtPart'){
                let itemObj = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['custitem_warranty_eligible']
                });
                log.debug('itemObjINVTPART==',itemObj);
                if(itemObj.custitem_warranty_eligible == true){
                    arrItemList.push({item: itemId,member: "",filter: false,item_type:'InvtPart'});
                    itemIds.push(itemId);
                }
            }
        }
        log.debug("arrItemList", JSON.stringify(arrItemList));
        log.debug('itemIds=='+itemIds.length,itemIds);
        
        //check for member's, member's... and so on for warranty eligible
        if(arrItemList.length > 0){

            let inventoryItems = arrItemList.filter(function(obj){
                return obj.item_type == 'InvtPart';
            });
            log.debug('inventoryItems=='+inventoryItems.length,inventoryItems);

            //check ofr replace/repaired then do nothing pass as it is
            let replacedOrRepaired = arrItemList.filter(function(obj){
                return obj.item_type == 'Replace/Repaired';
            });
            log.debug('replacedOrRepaired=='+replacedOrRepaired.length,replacedOrRepaired);

            //check each member items are eligible for warranty type 
            //along with check if member item is of type kit/assembly then there member are also eligible for warranty or not
            //first filter the data by type assembly or kit
            let assemblyOrKitItemData = arrItemList.filter(function(obj){
                return (obj.item_type == 'Assembly' || obj.item_type == 'Kit')
            });
            log.debug('assemblyOrKitItemData=='+assemblyOrKitItemData.length,assemblyOrKitItemData);

            if(assemblyOrKitItemData.length > 0){
                //filter the replaced sku(150-0016) for this item components are not eligible for warranty but this sku needs to come in warranty creation
                let replacedSku = arrItemList.filter(function(obj){
                    return (obj.member == replacedItem);
                });
                log.debug('replacedSku=='+replacedSku.length,replacedSku);
                let assemblyMemberDetails = getItemDetails(assemblyOrKitItemData);
                log.debug('dataInventory=='+dataInventory.length,dataInventory);
                inventoryItems = inventoryItems.concat(dataInventory);
                arrItemList = []; //refresh the array
                arrItemList = arrItemList.concat(inventoryItems).concat(replacedSku);
            }
            else if(replacedOrRepaired.length > 0){
                arrItemList = arrItemList;
            }
            else if(inventoryItems.length > 0){
                arrItemList = arrItemList
            }
            
            // arrItemList = GetItemDetails(arrmemberItems, arrItemList);//member item,itemm and there member item
            log.debug("final arrItemList", JSON.stringify(arrItemList));
        }

        if(arrItemList.length > 0){

            //check for the legecy or regular TOS						
            let defaultDate = runtime.getCurrentScript().getParameter({name: 'custscript_dd'});
            let dafaultDateFormat = new Date(defaultDate).getTime();
            log.debug("defaultDate - dafaultDateFormat", defaultDate + " - " + dafaultDateFormat);
            let tranDate = new Date(salesObj.getValue('trandate')).getTime();
            log.debug("tranDate", tranDate);
            let tosVersion = "",tosVersionText;
            if(tranDate < dafaultDateFormat){
                tosVersion = 1;//legacy
                tosVersionText = 'Legacy';
            }
            else if(tranDate > dafaultDateFormat){
                tosVersion = 2;//regular
                tosVersionText = 'Regular';
            }
            log.debug("tosVersion=="+tosVersion,'tosVersionText=='+tosVersionText);
            
            let warrantyRecIds = [];
            //Create Warranty record
            for(let index = 0; index < arrItemList.length; ++index){
                
                //Check component quantities
                let quantity = arrItemList[index].memberquantity || 1;

                if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
                    warrantyType = 3//limited
                }
                else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
                    warrantyType = 1//standard
                }
                else{
                    warrantyType = 2;//extended
                }
                //create extended warranty record
                let wRecCreated1 = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
                if(wRecCreated1.length > 0){
                    for(let wr1 in wRecCreated1){
                        warrantyRecIds.push(wRecCreated1[wr1]);
                    }
                }
            }
            log.debug('warrantyRecIds=='+warrantyRecIds.length,warrantyRecIds);
            //update extend product details on origianl sales order
            if(warrantyRecIds.length > 0){

                salesObj.setValue('custbody_extended_contract_id',extendContractToken);

                for(let d in extendProducts){
                    salesObj.selectNewLine({
                        sublistId: 'item'
                    });

                    salesObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        value: extendProducts[d].extendItemId
                    });

                    salesObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        value: 1
                    });

                    salesObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        value: 0
                    });

                    salesObj.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'amount',
                        value: 0
                    });

                    salesObj.commitLine({
                        sublistId: 'item'
                    });
                }

                //set  EXTENDED LEAD CONVERSION COMPLETED
                salesObj.setValue('custbody_lead_conversion_completed',true);

                let soIds = salesObj.save();
                if(soIds){
                    log.debug('SalesOrder Updated With Extended Product And Warranty Added',soIds);
                    //populate dates on warranty record
                    let warrantyDatesPopulated = claculateWarrantyExpiration(soIds,extendOrderDate);
                    if(typeof(warrantyDatesPopulated) == 'object' && warrantyDatesPopulated.error != undefined){
                        return {error:'WARRANTY_DATES_NOT_POPULATED',status:warrantyDatesPopulated.message};
                    }
                    else{
                        return {data:warrantyRecIds,originalSalesOrderId:soIds};
                    }
                }
            }
            else{
                return{error:'NO_WARRANTY_CREATED',data:warrantyRecIds};
            }
        }
        else{
            return{error:'NO_DATA_FOR_WARRANTY_CREATION',data:arrItemList};
        }
    } catch (error) {
        log.error('Error : In Add Warranty Record On Sales Order',error);
        return{error:error.message,status:false};
    }
}

//function to calculates dates for warranty record and update
const claculateWarrantyExpiration = (soIds,tranDate) => {
    try {

        let scriptObj = runtime.getCurrentScript();
        let fourYearExtendedWarrantyItem = scriptObj.getParameter('custscript__4yr_ext_warr_item');
        let fiveYearExtendedWarrantyItem = scriptObj.getParameter('custscript__5yr_ext_warr_item');
        
        let ifDate = tranDate;

        let soObj = record.load({
            type: 'salesorder',
            id: soIds,
            isDynamic: true
        });

        let warrantyLineCount = soObj.getLineCount('recmachcustrecord_warranty_sales_order');
        log.debug('warrantyLineCount==',warrantyLineCount);
        //check so itemhavig any extended warranty item
        let waranty4yrItem = false, warranty4yrSOItem, waranty5yrItem = false, warranty5yrSOItem;
        for (let ex = 0; ex < soObj.getLineCount('item'); ex++) {
            let itemId = soObj.getSublistValue('item', 'item', ex);
            // log.debug('soItemId=='+itemId);
            if (itemId == fourYearExtendedWarrantyItem) {
                waranty4yrItem = true;
                warranty4yrSOItem = itemId; break;//added to terminate the unnessary loop once match found
            }
            else if (itemId == fiveYearExtendedWarrantyItem) {
                waranty5yrItem = true;
                warranty5yrSOItem = itemId; break;
            }
        }
        // log.debug('waranty4yrItem=='+waranty4yrItem,'warranty4yrSOItem=='+warranty4yrSOItem);
        // log.debug('waranty5yrItem=='+waranty5yrItem,'warranty5yrSOItem=='+warranty5yrSOItem);

        for (let wl = 0; wl < warrantyLineCount; wl++) {
            try {
                let itemMatched = false;
                soObj.selectLine({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    line: wl
                });

                let itemId = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_item'
                });

                let itemObj = search.lookupFields({
                    type: search.Type.ITEM,
                    id: itemId,
                    columns: ['itemid']
                });
                // log.debug('itemObj==',itemObj);

                let itemSku = itemObj.itemid;

                let regularOrLegecy = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_tos_version'
                });//1 - Legacy, 2 - Regular
                let regularOrLegecyText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_tos_version'
                });

                let warrantyType = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_type'
                });//1 - Standard, 2 - Extended, 3 - limited
                let warrantyTypeText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_type'
                });

                let warrantyStatus = soObj.getCurrentSublistValue({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_status'
                });//3 - Replaced, 4 - Repaired
                let warrantyStatusText = soObj.getCurrentSublistText({
                    sublistId: 'recmachcustrecord_warranty_sales_order',
                    fieldId: 'custrecord_warranty_status'
                });
                // log.debug('warrantyStatus==',warrantyStatusText);

                // log.debug('itemSku=='+itemSku,'regularOrLegecy=='+regularOrLegecyText+'||warrantyType=='+warrantyTypeText);

                //check the stuats if only pending activation then do the dates calculations, else no dates calculations
                if (warrantyStatus == 1) {

                    //extended
                    if (warrantyType == 2) {
                        //set 4yr,5yr calculation
                        let values;
                        //4yr
                        if (waranty4yrItem == true) {
                            values = addYearInDateAndReturnText(ifDate, 4);
                        }
                        //5yr
                        else if (waranty5yrItem == true) {
                            values = addYearInDateAndReturnText(ifDate, 5);
                        }
                        if (values) {
                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_parts_expiration_date',
                                text: values
                            });

                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_labor_expiration_date',
                                text: values
                            });

                            itemMatched = true;
                        }
                    }
                    //limited
                    else if (warrantyType == 3) {
                        //+180days
                        let values = addDaysInDateAndReturnText(ifDate, 180);
                        if (values) {
                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_parts_expiration_date',
                                text: values
                            });

                            soObj.setCurrentSublistText({
                                sublistId: 'recmachcustrecord_warranty_sales_order',
                                fieldId: 'custrecord_labor_expiration_date',
                                text: values
                            });

                            itemMatched = true;
                        }
                    }
                    //non of them
                    else {
                        // log.debug('ITEM_NOT_MATCHED_FOR_DATES', itemSku);
                        itemMatched = false;
                    }

                    // log.debug('itemMatched==', itemMatched);

                    if (itemMatched == true) {
                        //set warranty activation date
                        soObj.setCurrentSublistText({
                            sublistId: 'recmachcustrecord_warranty_sales_order',
                            fieldId: 'custrecord_warranty_activation_date',
                            text: ifDate/* d */
                        });

                        //set warranty status
                        soObj.setCurrentSublistValue({
                            sublistId: 'recmachcustrecord_warranty_sales_order',
                            fieldId: 'custrecord_warranty_status',
                            value: 2//activated
                        });

                        soObj.commitLine({
                            sublistId: 'recmachcustrecord_warranty_sales_order'
                        });

                        // log.debug('DATE_SET_FOR', itemSku);
                    }

                }

            } catch (error) {
                log.error('Error : While Processing Warranty Line ==', error);
            }
        }
        let soId = soObj.save();
        if (soId) {
            log.debug('SO#==' + soId, 'Updated With Warranty Details');
            return Number(soId);
        }
    } catch (error) {
        log.error('Error : In Claculation Warranty Experation', error);
        return { error: error.name, message: error.message };
    }
}

//function to get the date by adding year and retun in text format
const addYearInDateAndReturnText = (date,yr) =>{
    let x = date.split('/');
    let d1 = x[1];
    let m = x[0];
    let y = x[2];
    date = y + '-' + m + '-' + d1;
    let d = moment(date,'YYYY-MM-DD');
    let fd = d.add('years',yr);
    let finalDate = format.format({
        value: new Date(fd),
        type: format.Type.DATE
    });
    return finalDate;
}

//function to get the date by adding days and retun in text format
const addDaysInDateAndReturnText = (date,days) =>{
    let x = date.split('/');
    let d1 = x[1];
    let m = x[0];
    let y = x[2];
    date = y + '-' + m + '-' + d1;
    var nsDate = format.format({
        value: new Date(new Date(date).setDate(new Date(date).getDate()+days+1)),
        type: format.Type.DATE
    });
    return nsDate;
}