/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR Create Warranty Record Error Handling
 * File Name   : Tonal_MR_Create_Warranty_Record_Error_Handling.js
 * Description : Script used to Create Warranty records for the not created warranty against each item in SO. Jira ticket [ES-3228]
 * Created On  : 12/18/2023 
 * Modification Details:  
 ************************************************************/
let search,record,runtime;
let dataItems = [],dataInventory = [];//these variabels will store data for the warranty items
define(["N/search","N/record","N/runtime"], main);
function main (searchModule,recordModule,runtimeModule) {
    try {
        search = searchModule;
        record = recordModule;
        runtime = runtimeModule;
    
        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

//function get Input satge , to get all the data from the saved search form script parameters
function getInputData() {
    try {
        let scriptObj = runtime.getCurrentScript();
        let repairedItem = scriptObj.getParameter('custscript_repaired_items_mr');
        let replacedItem = scriptObj.getParameter('custscript_replaced_items_mr');
        let defaultWarrantyItems = scriptObj.getParameter({name: 'custscript_ext_warranty_items_mr'});
        let defaultDate = scriptObj.getParameter({name: 'custscript_default_date_mr'});
        let ssId = scriptObj.getParameter('custscript_warranty_add_data');
        log.debug('ssId==',ssId);
        log.debug("defaultDate==", defaultDate);
        log.debug('defaultWarrantyItems==', defaultWarrantyItems);
        log.debug('repairedItem=='+repairedItem,'replacedItem=='+replacedItem);

        if(!repairedItem || !replacedItem || !defaultWarrantyItems || !defaultDate || !ssId){
            log.debug('NO_ACTION_PARAMS_MISSING',JSON.stringify({repairedItem:repairedItem,replacedItem:replacedItem,defaultWarrantyItems:defaultWarrantyItems,defaultDate:defaultDate,ssId:ssId}));
            return [];
        }

        return search.load({
            id: ssId
        });
    } catch (error) {
        log.error('Error : In Get Input Stage',error);
        return [];
    }  
}

//function map stage
const map = (context) => {
    let newRecord;
    try {
        // log.debug('mapContext==',context);
        let scriptObj = runtime.getCurrentScript();
        let repairedItem = scriptObj.getParameter('custscript_repaired_items_mr');
        let replacedItem = scriptObj.getParameter('custscript_replaced_items_mr');
        let defaultWarrantyItems = scriptObj.getParameter({name: 'custscript_ext_warranty_items_mr'});
        let defaultDate = scriptObj.getParameter({name: 'custscript_default_date_mr'});
        let data = JSON.parse(context.value);
        let soId = data.values['GROUP(internalid)']['value'];
        log.debug('Checking Warranty Creation Condition For Sale Order==',soId);
        //load the sales order and perform rest of the opertaions.
        newRecord = record.load({
            type: record.Type.SALES_ORDER,
            id: soId,
            isDynamic: true
        });

        //validate for the order type is "In Warranty Claim Order - 4" or "Out of Warranty Order - 5"
        let orderType = newRecord.getValue('custbody_jaz_ordertype');
        let orderTypeText = newRecord.getValue('custbody_jaz_ordertype');
        log.debug('orderType==',orderTypeText);

        let salesOrderStatus = newRecord.getValue('status');
        log.debug('salesOrderStatus==',salesOrderStatus);
        
        //get the item detail which contains "150-0016" and order status is not "in warranty claim order"(4) then create warranty object/record
        let replacedSkuLine = newRecord.findSublistLineWithValue({
            sublistId: 'item',
            fieldId: 'item',
            value: replacedItem
        });
        log.debug('replacedSkuLine==',replacedSkuLine);

        if((orderType != 4) || (orderType != 4 && replacedSkuLine > -1) || (orderType == 6 && salesOrderStatus == 'Closed')){
            log.debug('Warranty Creation Condition Passed Sale Order==',soId);
            context.write({key:soId,value:{status:true,details:{repairedItem:repairedItem,replacedItem:replacedItem,defaultDate:defaultDate,defaultWarrantyItems:defaultWarrantyItems,orderType:orderType}}});
        }
        else{
            log.debug('Warranty Creation Condition Failed Sale Order==',soId);
            context.write({key:soId,value:{status:false,details:{message:"NO_ACTION_CONDIATION_NOT_SATISFIED",reason:{orderType:orderType,replacedSkuLine:replacedSkuLine,salesOrderStatus:salesOrderStatus}}}});
        }
    } catch (error) {
        log.error('Error : In Map Stage',error);
        context.write({key:soId,value:{status:false,details:{message:error.message,reason:error.name}}});
    }
}

//function reduce stage
const reduce = (context) => {
    try {
        // log.debug('reduceContext',context);
        dataInventory = [],dataItems = [];
        let soId = JSON.parse(context.key);
        let recordId = soId;
        let data = JSON.parse(context.values[0]);
        let status = data.status;
        log.debug('Processing For Warranty Creation Sales Order==',soId);
        if(status == true){
            let newRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: soId,
                isDynamic: true
            });;
            let defaultWarrantyItems = data.details.defaultWarrantyItems;
            let repairedItem = data.details.repairedItem;
            let replacedItem = data.details.replacedItem;
            let defaultDate = data.details.defaultDate;
            let orderType = data.details.orderType;
            //validate order contains replaced/repaired items line
            let replacedItemAvilable = false, repairedItemAvilable = false;
            let soLineCount = newRecord.getLineCount('item');
            for(let s = 0 ; s < soLineCount ; s++){
                let itemId = newRecord.getSublistValue('item','item',s);
                if(itemId == repairedItem){
                    repairedItemAvilable = true;
                    break;
                }
                else if(itemId == replacedItem){
                    replacedItemAvilable = true;
                    break;
                }
            }

            log.debug('replacedItemAvilable=='+replacedItemAvilable,'repairedItemAvilable=='+repairedItemAvilable);
            
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
                    
                    let lineNumber = newRecord.findSublistLineWithValue({
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

            let arrItemList = [];
            let arrmemberItems = [];
            let itemIds = [];
            let warrantyRecIds = [];
            //loop over the line and get the sku details for the warranty creation
            //needs to check item is not replace,repaired and itemtype none of 'Service', 'OthCharge', 'Subtotal', 'Payment'
            for(let s = 0 ; s < soLineCount ; s++){
                let itemId = newRecord.getSublistValue('item','item',s);
                let itemType = newRecord.getSublistValue('item','itemtype',s);
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
                let dafaultDateFormat = new Date(defaultDate).getTime();
                log.debug("defaultDate - dafaultDateFormat", defaultDate + " - " + dafaultDateFormat);
                let tranDate = new Date(newRecord.getValue('trandate')).getTime();
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
                
                //Create Warranty record
                for(let index = 0; index < arrItemList.length; ++index){
                    
                    //Check component quantities
                    let quantity = arrItemList[index].memberquantity || 1;

                    //If Extended Warranty Item exists
                    if(isExtWarrantyExists){
                        
                        let warrantyType = '';
                        if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
                            warrantyType = 3//limited
                        }
                        else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
                            warrantyType = 1//standard
                        }
                        else{
                            warrantyType = 1;//standard
                        }
                        //create standard warranty record
                        let wRecCreated = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
                        if(wRecCreated.length > 0){
                            for(let wr in wRecCreated){
                                warrantyRecIds.push(wRecCreated[wr]);
                            }
                        }

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

                    }else{
                    
                        let warrantyType = '';
                        if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 5){
                            warrantyType = 3;//limited
                        }
                        else if((repairedItemAvilable == true || replacedItemAvilable == true) && orderType == 3){
                            warrantyType = 1//standard
                        }
                        else{
                            warrantyType = 1;//standard
                        }

                        let wRecCreated2 = createWarrantyRecord(recordId,arrItemList[index].item,warrantyType,arrItemList[index].member,tosVersion,quantity);
                        if(wRecCreated2.length > 0){
                            for(let wr2 in wRecCreated2){
                                warrantyRecIds.push(wRecCreated2[wr2]);
                            }
                        }
                    }
                }
                log.debug('warrantyRecIds=='+warrantyRecIds.length,warrantyRecIds);
            }

            if(warrantyRecIds.length > 0){
                log.debug('Warranty Created For Sales Order==',soId);
                context.write({key:soId,value:{status:true,message:"WARRANTY_CREATED",warrantyRecIds:warrantyRecIds}});
            }
            else{
                log.debug('Warranty Not Created For Sales Order==',soId);
                context.write({key:soId,value:{status:false,message:"WARRANTY_NOT_CREATED",warrantyRecIds:warrantyRecIds}});
            }
        }
        else{
            log.debug('Warranty Not Created For Sales Order==',soId);
            context.write({key:soId,value:{status:false,message:"WARRANTY_NOT_CREATED",warrantyRecIds:[],data:data}});
        }
    } catch (error) {
        log.error('Error :  In Reduce Stage',error);
        context.write({key:soId,value:{status:false,message:"WARRANTY_NOT_CREATED",warrantyRecIds:[],data:data}});
    }
}

//function summarize stage
const summarize = (summary) => {
    try {
        let successSalesOrdersWarrantyCreated = [], failureSalesOrdersWarrantyNotCreated = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'Warranty Create For Orders',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);
            
            if(data.status == true){
                successSalesOrdersWarrantyCreated.push({salesOrderId:key,value:data});
            }
            if(data.status == false){
                failureSalesOrdersWarrantyNotCreated.push({salesOrderId:key,value:data})
            }
            return true;
        });

        log.debug('successSalesOrdersWarrantyCreated=='+successSalesOrdersWarrantyCreated.length,successSalesOrdersWarrantyCreated[0]);
        log.debug('failureSalesOrdersWarrantyNotCreated=='+failureSalesOrdersWarrantyNotCreated.length,failureSalesOrdersWarrantyNotCreated);
    } catch (error) {
        log.error('Error : In Summarize Stage',error);
    }
}

//function to create the warranty record
const createWarrantyRecord = (soId,origianlItemId,warrantyType,warrantyItem,tos,quantity) =>{
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