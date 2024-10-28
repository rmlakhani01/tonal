/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst SFE Child SO Process
 * File Name   : Tonal_Rst_SFE_Child_SO_Process.js
 * Description : This script is used for create SFE child customer and sales order in NS. This Restlet will invoke from MuleSoft for SFE process.
 * Date: 24/09/2024
 * ************************************************************/
//1. get child customer or sales order record exists in NS , if not create new child customer or sales order , else use the existing one customer and return success response for the existing sales order
//2. create child sales order where rate zero, amount zero, revenue amt, description line
let search,record,runtime;
define(["N/search","N/record","N/runtime"], main);
function main(searchModule,recordModule,runtimeModule) {
    try {
        search = searchModule;
        record = recordModule;
        runtime = runtimeModule;
        return {
            post: sportAndFitnessOrderProcess
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

//function to return the response
const returnResponse = (state,errorMsg,nsOrderId,requestOrderId) => {
    let response = {};
    if(state == 'fail'){
        response.orderId = requestOrderId;
        response.netsuiteOrderInternalId = "";
        response.error = errorMsg;
    }
    if(state == 'success'){
        response.orderId = requestOrderId;
        response.netsuiteOrderInternalId = nsOrderId;
    }
    return response;
}

function sportAndFitnessOrderProcess(context) {
    let code,finalResponse = {status:200,successList:[],failureList:[]};
    try {
        let payload = context,response;
        log.debug('payload==',payload);

        //validate for the item form the script parameter
        let scriptObj = runtime.getCurrentScript();
        let partnerCustomer = scriptObj.getParameter('custscript_sdf_partner_pc');
        if(!partnerCustomer){
            response = returnResponse('fail','MISISNG_PARTNER_IN_PARAMETER', "", "");
            //failure
            if(response.error != undefined){
                finalResponse.failureList.push(response);
                return finalResponse;
            }
        }

        //validate payload mandatory attaributes
        if(!payload){
            response = returnResponse('fail','INVALID_PAYLOAD', "", "");
            //failure
            if(response.error != undefined){
                finalResponse.failureList.push(response);
                return finalResponse;
            }
        }
       
        let email = payload.email;
        //validate for the first,last name
        let firstName = payload.first_name;
        let lastName = payload.last_name;
        //validate for teh code, which contains order number
        code = payload.code;

        if(!email){
            response = returnResponse('fail','EMAIL_REQUIRED',"",code);
            //failure
            if(response.error != undefined){
                finalResponse.failureList.push(response);
                return finalResponse;
            }
        }
        if(!firstName || !lastName){
            response = returnResponse('fail','FIRST_NAME_LAST_NAME_REQUIRED',"",code);
            //failure
            if(response.error != undefined){
                finalResponse.failureList.push(response);
                return finalResponse;
            }
        }
        if(!code){
            response = returnResponse('fail','CODE_REQUIRED', "", "");
            //failure
            if(response.error != undefined){
                finalResponse.failureList.push(response);
                return finalResponse;
            }
        }

        //check order already exists, if exists termiante the current execution
        let uniqueId = payload.code;
        let salesOrderFound = getSalesOrderByExternalId(uniqueId);
        log.debug('salesOrderFound==',salesOrderFound);
        //failure
        if(salesOrderFound.error == undefined && salesOrderFound.data.length > 0){
            finalResponse.failureList.push(returnResponse('fail','SALES_ORDER_ALREADY_EXISTS('+salesOrderFound.data[0].tranid+')',"", code));
            return finalResponse;
        }

        //get the customer exist in NS or not, if not create new customer else used the existing one
        let customerFound = getCustomerByEmailId(email);
        log.debug('customerFound==',customerFound);
        let customerInternalId;
        //failure
        if(customerFound.error != undefined && customerFound.data.length == 0){
            finalResponse.failureList.push(returnResponse('fail',customerFound.error, "",code));
            return finalResponse;
        }
        //success customer exists, used the existing one
        else if(customerFound.error == undefined && customerFound.data.length > 0){
            customerInternalId = customerFound.data[0].customerId;
        }
        //scueess customer not exists, create new customer
        else if(customerFound.error == undefined && customerFound.data.length == 0){
            let newCustomerCreated = createCustomerInNetSuite(payload);
            log.debug('newCustomerCreated==',newCustomerCreated);
            //failure
            if(newCustomerCreated.error != undefined){
                finalResponse.failureList.push(returnResponse('fail',newCustomerCreated.error,"",code));
                return finalResponse;
            }
            customerInternalId = newCustomerCreated.netsuiteOrderInternalId;//here "netsuiteOrderInternalId" is represent customer id,because usnig one function to return response and this fucnction doesnot conatin any customer detail parameter 
        }

        //create sales order in NetSuite
        let newSalesOrderCreated = createSalesOrderInNetSuite(payload,customerInternalId,partnerCustomer);
        // log.debug('newSalesOrderCreated==',newSalesOrderCreated);
        //failure
        if(newSalesOrderCreated.error != undefined){
            finalResponse.failureList.push(returnResponse('fail',newSalesOrderCreated.error,"",code));
            return finalResponse;
        }
        //success
        finalResponse.successList.push(returnResponse('success','',newSalesOrderCreated.netsuiteOrderInternalId,code));
        
        log.debug('finalResponse==',finalResponse);
        return finalResponse;
        
    } catch (error) {
        log.error('Error : In Sport And Fitness Order Process',error);
        finalResponse.failureList.push(returnResponse('fail',error.message, "", code));
        return finalResponse;
    }
}

//function to get the customer by emailId
const getCustomerByEmailId = (emailId) => {
    try {
        let customerSearchObj = search.create({
            type: "customer",
            filters:
            [
               ["email","is",emailId.trim()], 
               "AND", 
               ["isinactive","is","F"]
            ],
            columns:
            [
               search.createColumn({name: "entityid", label: "ID"}),
               search.createColumn({name: "altname", label: "Name"}),
               search.createColumn({name: "email", label: "Email"}),
               search.createColumn({name: "phone", label: "Phone"}),
               search.createColumn({name: "altphone", label: "Office Phone"}),
               search.createColumn({name: "fax", label: "Fax"}),
               search.createColumn({name: "contact", label: "Primary Contact"}),
               search.createColumn({name: "externalid", label: "ExternalId"})
            ]
        });
        let searchResultCount = customerSearchObj.runPaged().count;
        log.debug("Coustomer Count By Email Id",searchResultCount);
        let dataObj = {data:[]};
        customerSearchObj.run().each(function(result){
            dataObj.data.push({customerId:result.id,externalId:result.getValue('externalid'),emailId:emailId});
            return true;
        });
        return dataObj;
    } catch (error) {
        log.error('Error : In Get Customer By Email Id',error);
        return {
            data:[],
            error:error.message
        }
    }
}

//function to create the customer in NS
const createCustomerInNetSuite = (data) => {
    try {
        let custObj = record.create({
            type: record.Type.CUSTOMER,
            isDynamic: true
        });

        let externalId = data.email;
        let firstName = data.first_name;
        let lastName = data.last_name;

        //set externalid
        if(externalId){
            custObj.setValue('externalid',externalId.toString());
        }

        custObj.setValue('isperson','T');

        if(firstName)
        custObj.setValue('firstname',firstName);

        if(lastName)
        custObj.setValue('lastname',lastName);
        //email
        if(data.email)
        custObj.setValue('email',data.email);

        //phone
        if(data.phone)
        custObj.setValue('phone',data.phone);

        //subsidiary, default subsidiary
        custObj.setValue('subsidiary',1);

        //currency
        if(data.currency)
        custObj.setText('currency',data.currency);

        //set billing address
        if(data.billingAddress && data.billingAddress.length > 0){
            let currentAddressCount = custObj.getLineCount({
                'sublistId': 'addressbook'
            });
          
            //loop over all the address object to set it as multiple address
            if(data.billingAddress.length > 0){

                for(let a in data.billingAddress){

                    let addressDetails = data.billingAddress[a];

                    log.debug('addressDetails==',addressDetails);

                    custObj.selectNewLine({
                        sublistId: 'addressbook'
                    });

                    let addressSubrecord = custObj.getCurrentSublistSubrecord({
                        sublistId: 'addressbook',
                        fieldId: 'addressbookaddress'
                    });
                
                    // Set all required values here.
                    if(addressDetails.name)
                    addressSubrecord.setValue({
                        fieldId: 'addressee',
                        value: addressDetails.name
                    });

                    if(addressDetails.country)
                    addressSubrecord.setValue({
                        fieldId: 'country',
                        value: addressDetails.country
                    });
        
                    if(addressDetails.phone)
                    addressSubrecord.setValue({
                        fieldId: 'addrphone',
                        value: addressDetails.phone
                    });
        
                    if(addressDetails.address1)
                    addressSubrecord.setValue({
                        fieldId: 'addr1',
                        value: addressDetails.address1
                    });
        
                    if(addressDetails.address2)
                    addressSubrecord.setValue({
                        fieldId: 'addr2',
                        value: addressDetails.address2
                    });
        
                    if(addressDetails.city)
                    addressSubrecord.setValue({
                        fieldId: 'city',
                        value: addressDetails.city
                    });
        
                    if(addressDetails.province)
                    addressSubrecord.setValue({
                        fieldId: 'state',
                        value: addressDetails.province
                    });
                
                    if(addressDetails.zip)
                    addressSubrecord.setValue({
                        fieldId: 'zip',
                        value: addressDetails.zip
                    });

                    //set default billig and default shipping
                    custObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultbilling',
                        value: true
                    });
                
                    custObj.commitLine({
                        sublistId: 'addressbook'
                    });

                }

            }
            
            if(data.shippingAddress.length > 0){

                for(let a in data.shippingAddress){

                    let addressDetails = data.shippingAddress[a];

                    log.debug('addressDetailsShipping==',addressDetails);

                    custObj.selectNewLine({
                        sublistId: 'addressbook'
                    });

                    let addressSubrecord = custObj.getCurrentSublistSubrecord({
                        sublistId: 'addressbook',
                        fieldId: 'addressbookaddress'
                    });
                
                    // Set all required values here.
                    if(addressDetails.name)
                    addressSubrecord.setValue({
                        fieldId: 'addressee',
                        value: addressDetails.name
                    });

                    if(addressDetails.country)
                    addressSubrecord.setValue({
                        fieldId: 'country',
                        value: addressDetails.country
                    });
        
                    if(addressDetails.phone)
                    addressSubrecord.setValue({
                        fieldId: 'addrphone',
                        value: addressDetails.phone
                    });
        
                    if(addressDetails.address1)
                    addressSubrecord.setValue({
                        fieldId: 'addr1',
                        value: addressDetails.address1
                    });
        
                    if(addressDetails.address2)
                    addressSubrecord.setValue({
                        fieldId: 'addr2',
                        value: addressDetails.address2
                    });
        
                    if(addressDetails.city)
                    addressSubrecord.setValue({
                        fieldId: 'city',
                        value: addressDetails.city
                    });
        
                    if(addressDetails.province)
                    addressSubrecord.setValue({
                        fieldId: 'state',
                        value: addressDetails.province
                    });
                
                    if(addressDetails.zip)
                    addressSubrecord.setValue({
                        fieldId: 'zip',
                        value: addressDetails.zip
                    });
                
                    custObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultshipping',
                        value: true
                    });

                    custObj.commitLine({
                        sublistId: 'addressbook'
                    });

                }

            }

        }

        let newCustId = custObj.save();
        if(newCustId){
            return returnResponse('success','',newCustId,'');
        }
    } catch (error) {
        log.error('Error : In Create Customer In NetSuite',error);
        return returnResponse('fail',error.message,'','');
    }
}

//function to create the sales order in NetSuite
const createSalesOrderInNetSuite = (payload,customerId,partnerCustomer) => {
    try {
        let soObj = record.create({
            type: record.Type.SALES_ORDER,
            isDynamic: true
        });

        //set the custom form
        // soObj.setValue('customform','');

        //set the customer
        soObj.setValue('entity',customerId);

        //set po#
        soObj.setValue('otherrefnum',payload.code);

        //set externalid
        soObj.setValue('externalid',payload.code);

        let customerObj = search.lookupFields({
            type: search.Type.CUSTOMER,
            id: customerId,
            columns: ['firstname','lastname']
        });

        //set memo
        soObj.setValue('memo',payload.code+"_"+customerObj.firstname+' '+customerObj.lastname);

        //if partner did not provide created_at date, set today's date
        if (!payload.created_at){
            payload.created_at= new Date();
        }
        //set tran date
        soObj.setValue('trandate',new Date(payload.created_at));

        //set saleseffective date
        soObj.setValue('saleseffectivedate',new Date(payload.created_at));

        //set woocom id
        soObj.setValue('custbody3',payload.code);

        let orderType = {
            "Supplier Direct Fulfillment": 8,
        };

        //set order type
        soObj.setValue('custbody_jaz_ordertype',orderType[payload.order_source]);

        //ste partner customer
        soObj.setValue('custbody_parent_customer',partnerCustomer);

        //items
        let lineItems = payload.itemList;
        let itemSkus = lineItems.map(a=>a.sku);
        log.debug('itemSkus=='+itemSkus.length,itemSkus);
        let nsItemData = getItemBySku(itemSkus);
        log.debug('nsItemData=='+nsItemData.data.length,nsItemData);
        //sort the items for NS item internalid
        for(let i in lineItems){
            let index = nsItemData.data.findIndex(function(obj){
                return obj.name == lineItems[i].sku;
            });
            if(index != -1){
                lineItems[i].itemId = nsItemData.data[index].id;
            }
        }

        log.debug("lineItems=="+lineItems.length,lineItems);

        for(let d in lineItems){
            //select new line on so
            soObj.selectNewLine('item');

            //set item
            soObj.setCurrentSublistValue('item','item',lineItems[d].itemId);

            //set rate
            soObj.setCurrentSublistValue('item','rate',Number(0));

            //set quantity
            soObj.setCurrentSublistValue('item','quantity',lineItems[d].quantity);

            //set amount
            soObj.setCurrentSublistValue('item','amount',Number(0));

            //set revenue amount
            soObj.setCurrentSublistValue('item','custcoll_sfe_revenue_amount',payload.itemList[d].price);

            soObj.commitLine('item');

        }

        let soId = soObj.save();
        if(soId){
            log.debug('New Sales Order Created',soId);
            let soObjData = search.lookupFields({
                type: search.Type.SALES_ORDER,
                id: soId,
                columns: ['tranid']
            })
            return returnResponse('success','',soId,payload.code);
        }
    } catch (error) {
        log.error('Errro : In Create Sales Order In NetSuite',error);
        return returnResponse('fail',error.message,'','');
    }
}

//function to get the item by sku
const getItemBySku = (skus) => {
    try {
        let filters = [],finalfilters = [];
        finalfilters.push(["isinactive","is","F"]);
        finalfilters.push("AND");
        finalfilters.push(["type","noneof","Description","Discount","Markup","OthCharge","Payment","Service","Subtotal","Group"]);
        finalfilters.push("AND");
        for(let f = 0  ; f < skus.length ; f++){
            filters.push(["nameinternal","is",skus[f]]);
            if(f < skus.length-1){
                filters.push("OR");
            } 
        }
        finalfilters.push(filters);
        // log.debug('finalfilters==',finalfilters);
        let itemSearchObj = search.create({
            type: "item",
            filters:finalfilters,
            columns:
            [
               search.createColumn({name: "itemid", label: "Name"}),
               search.createColumn({name: "displayname", label: "Display Name"}),
               search.createColumn({name: "salesdescription", label: "Description"}),
               search.createColumn({name: "type", label: "Type"}),
               search.createColumn({name: "displayname", label: "Display Name"})
            ]
        });
        let searchResultCount = itemSearchObj.runPaged().count;
        log.debug("Item By Sku Count",searchResultCount);
        let dataObj = {data:[]};
        itemSearchObj.run().each(function(result){
            dataObj.data.push({id:result.id,name:result.getValue('itemid')})
            return true;
        });
        return dataObj;
    } catch (error) {
        log.error('Error : In Get Item By Sku',error);
        return {data:[],error:error.message};
    }
}

//function to get the sale order details in NS byexternalid
const getSalesOrderByExternalId = (externalId) => {
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
        let dataObj = {data:[]};
        salesorderSearchObj.run().each(function(result){
            dataObj.data.push({salesOrderInternalId:result.id,externalId:result.getValue('externalid'),tranid:result.getValue('tranid')});
            return true;
        });
        return dataObj;
    } catch (error) {
        log.error('Error : In Get Order Details',error);
        return {
            data:[],
            error:error.message
        }
    }
}