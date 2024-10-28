/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet
 * Script Name : Tonal Rst Create Warranty Claim Order
 * File Name   : Tonal_Rst_Create_Warranty_Claim_Order.js
 * Description : This script is used for create warranty Sales Order
 * Created On  : 05/09/2023
 * Modification Details:  
 *
 ************************************************************/
/**
 * Update History
 * Version          Date                By                  Requested By                Description
 * V1               11/09/2023          Vikash              Radhe                       Modifciation for the paylaod, isstead of array of obejct single object will be payload request
 * V2               13/09/2023          Vikash              Joanna                      Modification for the linking of calimSo and Origianl SO and type
 * V3               21/09/2023          Vikash              Joanna                      Modification for the update Claim Type and return response
 * V4               22/09/2023          Vikash              Joanna                      Modification for the adding of claim type only on claim SO not on Oroginal SO
 * V5			    10/04/2023		    Vikash		        Ali					        Modification for the set "Extended Method" based on jira ticket ES-3003 inputs
 * V6               10/05/2023          Vikash              Joanna                      Modification for the orderType attribute field 
 * V7               10/09/2023          Vikash              Joanna                      Modification for the extended method if calim order line item type is "inventory/assembly" then replacement if "service" then repaire
 * V8               09/11/2023          Vikash              Jonna                       Modification as per the Jira ticket [ES-3109]
 */
define(
    [
        "N/search",
        "N/record",
        "N/runtime"
    ], function(search,record,runtime) {

    const createWarrantyClaimOrder = (context) => {
        try {
            //s1. Create claim order in NS with the payload data
            //The Claim Order should also have below special properties:
            //orderSource: Salesforce Claim Order
            //orderType: “In Warranty Order”
            //Warranty record: These type of Sales Order should not have new Warranty created under

            //s2. Link Sales Order with Warranty Record

            //s3. Update Warranty Status
            //The original warranty can be found with the field ‘warrantyId’, 
            //and the original warranty should be updated with status ‘Replaced’ or ‘Repaired’ 
            //based on the Claim Order Line item. For example, if Claim Sales Order has order line ‘Repair’, 
            //the original warranty line should have status ‘Repaired’, otherwise, ‘Replaced’.

            //get the replaced or repaired item details
            let scriptObj = runtime.getCurrentScript();
            let replacedItem = scriptObj.getParameter('custscript_replaced_item');
            let repairedItem = scriptObj.getParameter('custscript_repaired_item');
            log.debug('replacedItem=='+replacedItem,'repairedItem=='+repairedItem);

            const payload = context;
            log.debug('payload==',payload);
            if(!payload){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'INVALID_PAYLOAD',
                        message:'Please provide data for warranty claim order.'
                    }
                };
            }

            const data = payload;
            //validate for customer
           /*  let customer = data.customer;
            if(customer == undefined){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'CUSTOMER_MISSING',
                        message:'Please provide customer for warranty claim order.'
                    }
                };
            } */

            //validation for items
            let items = data.items;
            if(items == undefined || items.length == 0){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'ITEMS_MISSING',
                        message:'Please provide items for warranty claim order.'
                    }
                };
            }

            //validation for original order number
            let originalOrderNumber = data.originalOrderNumber;
            if(originalOrderNumber == undefined || originalOrderNumber == ''){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'ORIGINAL_ORDER_MISSING',
                        message:'Please provide original order details for warranty claim order.'
                    }
                };
            }

            //validate for the warrantyid
            let warrantyId = data.warrantyId;
            log.debug('warrantyId==',warrantyId);
            if(warrantyId == undefined || !warrantyId){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'MISSING_WARRANTYID',
                        message:'Please provide warranty id for warranty claim order.'
                    }
                };
            }

            //get the sales order details by original order number
            let originalSOId = getOriginalSalesOrder(originalOrderNumber);
            log.debug('originalSOId==',originalSOId);

            if(originalSOId.length == 0){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'MISSING_ORIGINAL_SALES_ORDER',
                        message:'Original Sales Order not available.'
                    }
                };
            }

            //create sales order in netsuite with payload data
            let soId = createSalesOrder(data,originalSOId);
            log.debug('soId==',soId);
            //fail
            if(typeof(soId) == 'object'){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:soId.error,
                        message:soId.details
                    }
                };
            }
            //success
            else{
                //Link Sales Order with Warranty Record
                let claimRec = createClaimRecord(originalSOId,soId,2);//(originalso,claim,type)
                log.debug('claimRecWithClaim==',claimRec);
                //fail
                if(typeof(claimRec) == 'object'){
                    return {
                        status:0,
                        message:'fail',
                        details:{
                            error:claimRec.error,
                            message:claimRec.details
                        }
                    };
                }
                //success
                else{
                    let claimRec = createClaimRecord(soId,originalSOId,1);
                    log.debug('claimRecWithOriginal==',claimRec);
                    //update the warranty status based on item in SO line
                    //if item is for replace then status of warranty is replace,else repaired
                    //load the so and get the item details for the comparison with replaced/repaired item
                    const soObj = record.load({
                        type: record.Type.SALES_ORDER,
                        id: soId,
                        isDynamic:true
                    });

                    let lineCount = soObj.getLineCount('item','item');
                    let repairedItemAvailable = false,replacedItemAvailable = false;
                    for(let l = 0 ; l < lineCount ; l++){
                        let itemId = soObj.getSublistValue('item','item',l);
                        let itemType = soObj.getSublistValue('item','itemtype',l);
                        log.debug('itemType==',itemType);
                        /* if(itemId == repairedItem){
                            repairedItemAvailable = true;
                            break;
                        }
                        else if(itemId == replacedItem){
                            replacedItemAvailable = true;
                            break;
                        } */
                        if(itemType == 'InvtPart' || itemType == 'Assembly'){
                            replacedItemAvailable = true;
                            break;
                        }
                        else if(itemType == 'Service'){
                            repairedItemAvailable = true;
                            break;
                        }
                    }

                    log.debug('repairedItemAvailable=='+repairedItemAvailable,'replacedItemAvailable=='+replacedItemAvailable);

                    let status,extendedMethod = '';
                    if(replacedItemAvailable == true){
                        status = 3;//replaced
                    }
                    if(repairedItemAvailable == true){
                        status = 4;//repaired
                    }
                    log.debug('status==',status);

                    //if order type is "In Warranty Claim Order" and claim type is "Extended", then loot for the item/order is repaired or replacement
                    //if item/order is repair then "Extended Method" is "onsite_repair" else "product_replacement"
                    if((data.orderType && data.claimType) && (data.orderType.refName == soObj.getText('custbody_jaz_ordertype') && data.claimType.includes('Extended') == soObj.getText('custbody_claim_type').includes('Extended'))){
                        //case 1: item is repaired
                        if(repairedItemAvailable == true){
                            extendedMethod = 1;//onsite_repair
                        }
                        else{
                            extendedMethod = 2;//product_replacement
                        }
                    }
                    log.debug('extendedMethod==',extendedMethod);

                    if(status && extendedMethod){
                        let id = record.submitFields({
                            type: 'customrecord_warranty',
                            id: warrantyId,
                            values: {
                                custrecord_warranty_status:status,
                            }
                        });

                        if(id){
                            //set extended method on claim so and save the so
                            soObj.setValue('custbody_extended_method',extendedMethod);
                            let s_Id = soObj.save();
                            if(s_Id){
                                log.debug('Extended Method Update==',s_Id);
                            }
                            log.debug('Warranty Status Updated==',id);
                            return{
                                status:1,
                                message:'success',
                                details:{
                                    claim_sales_order_id:soId,  
                                    claim_sales_order_trandid:search.lookupFields({type: search.Type.SALES_ORDER,id: soId,columns: ['tranid']}).tranid,
                                    original_sales_order_id:data.originalOrderNumber,
                                    original_sales_order_tarnid:search.lookupFields({type: search.Type.SALES_ORDER,id: originalSOId[0].id,columns: ['tranid']}).tranid,
                                    message:'Claim Sales Order Created SuccessFully.'
                                }
                            }

                        }
                        else{
                            return {
                                status:0,
                                message:'fail',
                                details:{
                                    claim_sales_order_id:soId,
                                    claim_sales_order_tranid:search.lookupFields({type: search.Type.SALES_ORDER,id: soId,columns: ['tranid']}).tranid,
                                    original_sales_order_id:data.originalOrderNumber,
                                    original_sales_order_tranid:search.lookupFields({type: search.Type.SALES_ORDER,id: originalSOId[0].id,columns: ['tranid']}).tranid,
                                    message:'Warranty Status Not Updated.'
                                }
                            }
                        }
                    }
                    else{
                        return {
                            status:0,
                            message:'fail',
                            details:{
                                calim_sales_order_id:soId,
                                original_sales_order_id:data.originalOrderNumber,
                                message:'Warranty Status Not Updated Status Not Defined.'
                            }
                        }
                    }
                    
                }
            }
            
        } catch (error) {
            log.error('Main Exception',error);
            return{
                status:0,
                message:'fail',
                details:{
                    error:error.name,
                    message:error.message
                }
            }
        }
    }

    //function to create the sales order in netsuite
    const createSalesOrder = (data,originalSO) =>{
        try {
            const soObj = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });

            //get customer details by externalid
            /* let customerId = getCustomerByExternalId(data.customer.externalId);
            log.debug('customerId==',customerId);
            if(customerId == false){
                return{
                    error:'CUSTOMER_NOT_AVAILABLE',
                    message:'Customer' +data.customer.externalId+ ' is missing in NetSuite.'
                }
            }

            //set customer
            soObj.setValue('entity',customerId); */
            soObj.setValue('entity',originalSO[0].customer);

            //set externalid
            //Joanna updated on Feb 14, not enforce externalId on Order and instead use Sales Order Number as externalid
            // if(data.externalId)
            // soObj.setValue('externalid',data.externalId);

            //set otherRefNum
            /* if(data.otherRefNum)
            soObj.setValue('otherrefnum',data.otherRefNum); */

            //set salesOrderTransactionId
            //soObj.setValue('',data.salesOrderTransactionId);

            let salesEffectiveDate = data.salesEffectiveDate;
            if(salesEffectiveDate){
                let sed = salesEffectiveDate.split('T')[0];
                let x = sed.split('-');
                sed = x[1] + '/' + x[2] + '/' + x[0];//mm/dd/yyyy

                //set salesEffectiveDate
                soObj.setText('saleseffectivedate',sed);
            }
            

            let transDat = data.transactionDate;
            if(transDat){
                let tranDate = transDat.split('T')[0];
                let y = tranDate.split('-');
                tranDate = y[1] + '/' + y[2] + '/' + y[0];
    
                //set transactionDate
                soObj.setText('trandate',tranDate);
            }
           
            //set orderStatus
            if(data.orderStatus)
            soObj.setText('status',data.orderStatus);

            //set currency
            // soObj.setText('currency',data.currency);

            let orderSourceType = {
                'In Warranty Claim Order':4,
                'Out of Warranty Order':5
            }

            //set orderSource
            if(data.orderType)
            soObj.setValue('custbody_jaz_ordertype',orderSourceType[data.orderType.refName]);

            //set claim type
            let claimType = {
                'Standard In-warranty':1,	
                'Extended In-warranty':2
            }

            if(data.claimType)
            soObj.setValue('custbody_claim_type',claimType[data.claimType]);

            //set items
            for(let i in data.items){
                let itemData = data.items[i];
                soObj.selectNewLine({
                    sublistId: 'item'
                });

                let itemSku = itemData.number;
                //get the item details by sku code
                let nsItemData = getItemBySku(itemSku);
                log.debug('nsItemData==',nsItemData);
                if(nsItemData.length == 0){
                    return {
                        error:'Item_NOT_AVAILABLE',
                        message:'Item' +itemSku+ 'is missing in NetSuite.'
                    }
                }

                soObj.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    value:nsItemData[0].item_id
                });

                soObj.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: itemData.quantity,
                });

                soObj.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'rate',
                    value: itemData.price,
                });

                soObj.commitLine('item');

            }

            //set billing address
            // Create the subrecord Billing.
            var subrec_B = soObj.getSubrecord({
                fieldId: 'billingaddress'
            });
            subrec_B.setValue('country',data.billingAddress.country)
            subrec_B.setValue('attention',data.billingAddress.attention);
            subrec_B.setValue('addressee',data.billingAddress.name);
            subrec_B.setValue('addrphone',data.billingAddress.phone);
            subrec_B.setValue('addr1',data.billingAddress.addr1);
            subrec_B.setValue('addr2',data.billingAddress.addr2);
            subrec_B.setValue('city',data.billingAddress.city);
            subrec_B.setValue('state',data.billingAddress.state);
            subrec_B.setValue('zip',data.billingAddress.zip);

            //set shipping address
            // Create the subrecord Shipping.
            var subrec_S = soObj.getSubrecord({
                fieldId: 'shippingaddress'
            });
            subrec_S.setValue('country',data.shippingAddress.country);
            subrec_S.setValue('attention',data.shippingAddress.attention);
            subrec_S.setValue('addressee',data.shippingAddress.name);
            subrec_S.setValue('addrphone',data.shippingAddress.phone);
            subrec_S.setValue('addr1',data.shippingAddress.addr1);
            subrec_S.setValue('addr2',data.shippingAddress.addr2);
            subrec_S.setValue('city',data.shippingAddress.city);
            subrec_S.setValue('state',data.shippingAddress.state);
            subrec_S.setValue('zip',data.shippingAddress.zip);

            let soId = soObj.save();
            if(soId){
                let tranid = search.lookupFields({
                    type: search.Type.SALES_ORDER,
                    id: soId,
                    columns: ['tranid']
                }).tranid;
            
                // Update the Sales Order with the externalid set to the tranid
                record.submitFields({
                    type: record.Type.SALES_ORDER,
                    id: soId,
                    values: {
                        otherrefnum: tranid, 
                        externalid: tranid
                    }
                });
                log.debug('New Sales Order Created For Claim',soId);
                return Number(soId);
            }
        } catch (error) {
            log.error('Error : In Create Sales Order',error);
            return {error:error.message,details:error.name}
        }
    }

    //function to get the customer by externalid
    const getCustomerByExternalId = (externalId) =>{
        try {
            const customerSearchObj = search.create({
                type: "customer",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["externalid","anyof",externalId]
                ],
                columns:
                [
                   search.createColumn({
                      name: "entityid",
                      sort: search.Sort.ASC,
                      label: "ID"
                   }),
                   search.createColumn({name: "altname", label: "Name"}),
                   search.createColumn({name: "email", label: "Email"}),
                   search.createColumn({name: "externalid", label: "External ID"})
                ]
            });
            let searchResultCount = customerSearchObj.runPaged().count;
            log.debug("Customer Count By ExternalId",searchResultCount);
            let customerId = false;
            customerSearchObj.run().each(function(result){
                customerId = result.id;
                return true;
            });
            return customerId;
        } catch (error) {
            log.error('Error : In Get Customer By ExternalId',error);
            return false;
        }
    }

    //function to get the item by sku
    const getItemBySku = (sku) =>{
        try {
            const itemSearchObj = search.create({
                type: "item",
                filters:
                [
                   ["type","noneof","Description","Discount","Markup","OthCharge","Payment","Subtotal","Group"], 
                   "AND", 
                   ["nameinternal","is",sku], 
                   "AND", 
                   ["isinactive","is","F"]
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
                   search.createColumn({name: "type", label: "Type"}),
                ]
            });
            let searchResultCount = itemSearchObj.runPaged().count;
            log.debug("ItemCount By Sku",searchResultCount);
            const itemData = [];
            itemSearchObj.run().each(function(result){
                itemData.push({
                    item_id:result.id,
                    item_type:result.getValue('type'),
                    item_sku:result.getValue('itemid')
                })
                return true;
            });
            return itemData;
        } catch (error) {
            log.error('Error : In Get Item By Sku',error);
            return [];
        }
    }

    //function to create the claim customrecord
    const createClaimRecord = (originalOrderNumber,soId,type) => {
        try {
            const recObj = record.create({
                type: 'customrecord_warranty_related_record',
                isDynamic: true
            });

            //set original order
            if(type == 2){
                recObj.setValue('custrecord5',originalOrderNumber[0].id);
            }
            else{
                recObj.setValue('custrecord5',originalOrderNumber);
            }

            //set claim so
            if(type == 2){
                recObj.setValue('custrecord6',soId);
            }
            else{
                recObj.setValue('custrecord6',soId[0].id);
            }

            //set type
            recObj.setValue('custrecord_warranty_relatedrecord_type',type);

            let claimRecId = recObj.save();
            if(claimRecId){
                log.debug('Claim Custom Rec Created==',claimRecId);
                return Number(claimRecId);
            } 
        } catch (error) {
            log.error('Error : In Create Claim Custom Record',error);
            return{error:error.message,details:error.name};
        }
    }

    //function to get the original so details
    const getOriginalSalesOrder = (originalOrderNumber) => {
        try {
            const salesOrders = [];
            search.create({
                type: search.Type.TRANSACTION,
                filters: [
                    {
                        name: 'type',
                        operator: search.Operator.ANYOF,
                        values: ['SalesOrd'],
                    },
                    {
                        name: 'mainline',
                        operator: search.Operator.IS,
                        values: true,
                    },
                    {
                        name: 'otherrefnum',
                        operator: search.Operator.EQUALTO,
                        values: [originalOrderNumber],
                    },
                ],
                columns: [{ name: 'internalid' }, { name: 'entity' }],
            }).run().each((salesOrder) => {
                let order = {
                    id: salesOrder.getValue({ name: 'internalid' }),
                    customer: salesOrder.getValue({ name: 'entity' }),
                }
                salesOrders.push(order);
                return true
            });
            return salesOrders;
        } catch (error) {
            log.error('Error : In Get Original Sales Order',error);
            return [];
        }
    }

    return {
        post: createWarrantyClaimOrder,
    }
});