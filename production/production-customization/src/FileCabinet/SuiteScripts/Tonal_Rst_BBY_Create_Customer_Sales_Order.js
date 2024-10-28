/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst BBY Create Customer And SalesOrder
 * File Name   : Tonal_Rst_BBY_Create_Customer_Sales_Order.js
 * Description : This script is used for creation of customer and sales order for Best Buy Orders
 * Created On  : 24/11/2023
 * Modification Details: 
 * ***********************************************************/
let search, record, runtime;
define(["N/search","N/record","N/runtime"],main);

//main function , trigger point
function main (searchModule,recordModule,runtimeModule) {

    search = searchModule;
    record = recordModule;
    runtime = runtimeModule;

    return {
        post: createBBYCustomerAndSalesOrder
    }
}

//function to create the customer and sales order
const createBBYCustomerAndSalesOrder = (context) => {
    try {
        let paylaod = context;
        log.debug('payload==',paylaod);
        if(!paylaod){
            return returnResponse('fail','INVALID_PAYLOAD','','','');
        }

        let limit = paylaod.limit;
        if(!limit){
            return returnResponse('fail','LIMIT_IS_MISSING','','','');
        }

        if(limit > 50 || limit <= 0){
            return returnResponse('fail','LIMIT_EXCEDING','','','');
        }

        let customerDatas = paylaod.data;
        if(!customerDatas){
            return returnResponse('fail','NO_DATA_FOR_PROCESS','','','');
        }

        let customerDataCount = customerDatas.length;
        if(!customerDataCount){
            return returnResponse('fail','NO_DATA_FOR_PROCESS','','','');
        }

        let scriptObj = runtime.getCurrentScript();
        let customForm = scriptObj.getParameter('custscript_tnl_bby_customer_form');
        log.debug('customForm==',customForm);
        if(!customForm){
            return returnResponse('fail','MISSING_CUSTOM_FORM','','','');
        }

        let successFailData = [];
        for(let d in customerDatas){
            let processSucessOrFailure = processFunction(customerDatas[d],scriptObj,customForm);
            //fail
            if(processSucessOrFailure[0].success == false){
                successFailData.push(processSucessOrFailure[0]);
            }
            //success
            else{
                successFailData.push(processSucessOrFailure[0]);
            }
        }

        log.debug('successFailData=='+successFailData.length,successFailData);

        return successFailData;
    } catch (error) {
        log.error('Main Exception',error);
        return returnResponse('fail',error.message,customerExternalId,'','');
    }
}

//function to return the response
const returnResponse = (message, errorMessage, customerExternalId,nsCustomerId,nsSalesOrderId) => {
    let responseObj = {};
    let details = [];
    if (message == 'fail') {
        responseObj.success = false;
        responseObj.error = errorMessage;
        responseObj.ns_customer_id = "";
        responseObj.externalId = customerExternalId;
        details.push(responseObj);
    }
    if (message == 'success') {
        responseObj.success = true;
        responseObj.error = "";
        responseObj.ns_customer_id = nsCustomerId;
        responseObj.ns_salesorder_id = nsSalesOrderId;
        responseObj.externalId = customerExternalId;
        details.push(responseObj);
    }

    return details;
}

//function to create the new customer in netsuite
const addCustomerInNetSuite = (data,customform) => {
    try {
        let custObj = record.create({
            type: record.Type.CUSTOMER,
            isDynamic: true
        });

        custObj.setValue('customform',customform);

        let externalId = data.externalId;
        let firstName = data.firstName;
        let lastName = data.lastName;
        let midName = data.midName;
        let isIndividual = data.isIndividual;

        log.debug('isIndividual==',isIndividual);

        //validate for the externalid
        if(!externalId){
            return{
                success:false,
                error:{
                    name:'EXTERNALID_REQ',
                    message:'Externalid is missing',
                    externalId:data.externalId
                }
            };
        }

        //validate for the isindividual
        if(typeof(isIndividual) != 'boolean' || isIndividual == undefined){
            return{
                success:false,
                error:{
                    name:'IS_INDIVIDUAL_REQ',
                    message:'Is individual is missing',
                    externalId:data.externalId
                }
            };
        }

        //validate for the subsidiary
        if(!data.subsidiary){
            return{
                success:false,
                error:{
                    name:'SUBSIDIARY_IS_REQ',
                    message:'Subsidiary is missing',
                    externalId:data.externalId
                }
            };
        }

        //validate for the status
        if(!data.status){
            return{
                success:false,
                error:{
                    name:'STATUS_IS_REQ',
                    message:'Status is missing',
                    externalId:data.externalId
                }
            };
        }

        //set externalid
        if(externalId)
        custObj.setValue('externalid',externalId);

        //set first name,last name,mid name
        if(isIndividual == true){

            //validate for the first name
            if(!firstName || !lastName){
                return{
                    success:false,
                    error:{
                        name:'FIRST_NAME_LAST_NAME_REQ',
                        message:'First/Last name is missing',
                        externalId:data.externalId
                    }
                };
            }

            custObj.setValue('isperson','T');

            if(firstName)
            custObj.setValue('firstname',firstName);

            if(midName)
            custObj.setValue('middlename',midName);

            if(lastName)
            custObj.setValue('lastname',lastName);

            if(data.companyName)
            custObj.setValue('companyname',data.companyName);
               
        }

        //set company name
        if(isIndividual == false){  
            if(!data.companyName){
                return{
                    success:false,
                    error:{
                        name:'COMAPNY_NAME_REQ',
                        message:'Company name is missing',
                        externalId:data.externalId
                    }
                };
            }

            if(data.companyName){
                custObj.setValue('isperson','F');
                custObj.setValue('companyname',data.companyName);
            }
        }

        //status
        if(data.status)
        custObj.setValue('entitystatus',data.status.id); 

        let customerType = {
            'Best Buy Wholesale':5
        }
        
        //customer type
        if(data.custentity_customer_type)
        custObj.setValue('custentity_customer_type',customerType[data.custentity_customer_type]);

        //category
        let customerCategoryMap = {
            "Corporate Wellness":"1",
            "Hospitality":"2",
            "Healthcare":"3",
            "Consumer": "4",
            "Commercial": "5",
            "Marketing":"6",
            "Employee":"7",
            "Contractor":"8"
        };

        if(data.category)
        custObj.setValue('category',customerCategoryMap[data.category]);

        //email
        if(data.email)
        custObj.setValue('email',data.email);

        //phone
        if(data.phone)
        custObj.setValue('phone',data.phone);

        //mobile
        if(data.mobile)
        custObj.setValue('altphone',data.mobile);

        //subsidiary
        if(data.subsidiary)
        custObj.setValue('subsidiary',data.subsidiary.id);

        //set address
        if(data.address){
            let currentAddressCount = custObj.getLineCount({
                'sublistId': 'addressbook'
            });
          
            //loop over all the address object to set it as multiple address
            if(data.address.length > 0){

                for(let a in data.address){

                    let addressDetails = data.address[a];

                    log.debug('addressDetails==',addressDetails);

                    if(currentAddressCount === 0){
                        custObj.selectNewLine({
                            sublistId: 'addressbook'
                        });
                    } 
                    else {
                        custObj.selectLine({
                            sublistId: 'addressbook',
                            line: 0
                        });     
                    } 

                    let addressSubrecord = custObj.getCurrentSublistSubrecord({
                        sublistId: 'addressbook',
                        fieldId: 'addressbookaddress'
                    });
                
                    // Set all required values here.
                    if(addressDetails.country)
                    addressSubrecord.setText({
                        fieldId: 'country',
                        value: addressDetails.country
                    });
        
                    if(addressDetails.attention)
                    addressSubrecord.setValue({
                        fieldId: 'attention',
                        value:  addressDetails.attention
                    });
        
                    if(addressDetails.addressee)
                    addressSubrecord.setValue({
                        fieldId: 'addressee',
                        value: addressDetails.addressee
                    });
        
                    if(addressDetails.phone)
                    addressSubrecord.setValue({
                        fieldId: 'addrphone',
                        value: addressDetails.phone
                    });
        
                    if(addressDetails.addr1)
                    addressSubrecord.setValue({
                        fieldId: 'addr1',
                        value: addressDetails.addr1
                    });
        
                    if(addressDetails.addr2)
                    addressSubrecord.setValue({
                        fieldId: 'addr2',
                        value: addressDetails.addr2
                    });
        
                    if(addressDetails.city)
                    addressSubrecord.setValue({
                        fieldId: 'city',
                        value: addressDetails.city
                    });
        
                    if(addressDetails.state)
                    addressSubrecord.setValue({
                        fieldId: 'state',
                        value: addressDetails.state
                    });
                
                    if(addressDetails.zip)
                    addressSubrecord.setValue({
                        fieldId: 'zip',
                        value: addressDetails.zip
                    });

                    // log.debug('addressDetails.defaultBilling==',addressDetails.defaultBilling);
                    // log.debug('addressDetails.defaultShipping==',addressDetails.defaultShipping);
                    //set default billig and default shipping
                    if(addressDetails.defaultBilling == true){
                        custObj.setCurrentSublistValue({
                            sublistId: 'addressbook',
                            fieldId: 'defaultbilling',
                            value: true
                        });
                    }
                
                    if(addressDetails.defaultShipping == true){
                        custObj.setCurrentSublistValue({
                            sublistId: 'addressbook',
                            fieldId: 'defaultshipping',
                            value: true
                        });
                    }

                    custObj.commitLine({
                        sublistId: 'addressbook'
                    });

                }

            }

        }

        //terms
        if(data.terms)
        custObj.setValue('terms',data.terms);

        //creditlimit
        if(data.creditLimit)
        custObj.setValue('creditlimit',data.creditLimit);

        if(data.account)
        custObj.setValue('accountnumber',data.account);

        if(data.taxRegNumber)
        custObj.setValue('vatregnumber',data.taxRegNumber);

        if(data.taxable == true)
        custObj.setValue('taxable',true);

        let newCustId = custObj.save();
        if(newCustId){
            //load the customer and set the deaultshipping and defaultbilling for the first line of address as came from the first address object in array
            if(data.address && data.address.length > 0){
                let customerObj = record.load({
                    type: 'customer',
                    id: newCustId,
                    isDynamic: true
                });

                customerObj.selectLine({
                    sublistId: 'addressbook',
                    line: 0
                });

                let addressData = data.address[0];

                let def_shipping = addressData.defaultShipping;
                let def_billing = addressData.defaultBilling;

                if(def_shipping == true){
                    customerObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultshipping',
                        value: true
                    });
                }else{
                    customerObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultshipping',
                        value: false
                    });
                }

                if(def_billing == true){
                    customerObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultbilling',
                        value: true
                    });
                }else{
                    customerObj.setCurrentSublistValue({
                        sublistId: 'addressbook',
                        fieldId: 'defaultbilling',
                        value: false
                    });
                }

                customerObj.commitLine({
                    sublistId: 'addressbook'
                });

                let updatedCustomerId = customerObj.save();
                if(updatedCustomerId){
                    log.debug('Customer Updated With Correct Shipping And Billing Data','Ok..');
                }

            }

            return{
                success:true,
                ns_customer_id:newCustId.toString(),
                data:data
            };
        }

    } catch (error) {
        log.error('Error : In Add Customer In NetSuite',error);
        return{
            success:false,
            error:error,
            externalId:data.externalId
        };
    }
}

//function to check customer already exixts
const getCustomerAlreadyExistsInNetSuite = (externalId) =>{
    try {
        let customerSearchObj = search.create({
            type: "customer",
            filters:
            [
               ["isinactive","is","F"], 
               "AND", 
               ["externalid","is",externalId]
            ],
            columns:
            [
               search.createColumn({
                  name: "entityid",
                  sort: search.Sort.ASC,
                  label: "ID"
               }),
               search.createColumn({name: "altname", label: "Name"}),
               search.createColumn({name: "email", label: "Email"})
            ]
        });
        let searchResultCount = customerSearchObj.runPaged().count;
        log.debug("Customer Count",searchResultCount);
        let customerId = searchResultCount;
        customerSearchObj.run().each(function(result){
            customerId = result.id;
            return true;
        });
        return customerId;
    } catch (error) {
        log.error('Error : In Get Cutomer Already Exists',error);
        return 0;
    }
}

//function to create sales order in NetSuite
const createSalesOrderInNetSuite = (customerId,scriptObj) =>{
    try {
        
        const soObj = record.create({
            type: record.Type.SALES_ORDER,
            isDynamic: true
        });

        //set customer
        soObj.setValue('entity',customerId);

        let customerType = {
            'Best Buy Wholesale':5
        }

        //set customer type
        soObj.setValue('custbody_customer_type',customerType['Best Buy Wholesale']);

        let orderType = {
            'Best Buy Wholesale' : 6
        }

        //set order type
        soObj.setValue('custbody_jaz_ordertype',orderType['Best Buy Wholesale']);

        //set items 
        soObj.selectNewLine({
            sublistId: 'item'
        });

        soObj.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            value:scriptObj.getParameter('custscript_bby_item')
        });

        soObj.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            value: 0,
        });

        soObj.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'rate',
            value: 0,
        });

        soObj.commitLine('item');

        let soId = soObj.save();
        if(soId){
            let soData = search.lookupFields({type: search.Type.SALES_ORDER,id: soId,columns: ['tranid']});
            let id = record.submitFields({
                type: record.Type.SALES_ORDER,
                id: soId,
                values: {
                    otherrefnum:soData.tranid,
                    externalid:soData.tranid
                }          
            })
            log.debug('New Sales Order Created For BBY',soId);
            return {saleOrderId:id};
        }
    } catch (error) {
        log.error('Error : In Create Sales Order',error);
        return {error:error.message,details:error.name}
    }
}

//function to perform all opertaion
const processFunction = (payload,scriptObj,customForm) => {
    try {
        let customerData = payload;
        let customer = customerData.Customer;
        if(!customer){
            return returnResponse('fail','CUSTOMER_MISISNG','','','');
        }

        const customerExternalId = customer.externalId;
        if(!customerExternalId){
            return returnResponse('fail','CUSTOMER_EXTERNALID_REQ','','','');
        }

        //ceck customer already exist in NetSuite
        let customerExists = getCustomerAlreadyExistsInNetSuite(customerExternalId);
        //Add new customer, then create SO
        if(customerExists == 0){
            //create customer in netsuite
            let customerAddedInNetSuite = addCustomerInNetSuite(customer,customForm);
            log.debug('customerAddedInNetSuite==',customerAddedInNetSuite);

            //success
            if(customerAddedInNetSuite.success == true){
                //create sales order
                let soCreated = createSalesOrderInNetSuite(customerAddedInNetSuite.ns_customer_id,scriptObj);
                //fail
                if(soCreated.error){
                    return returnResponse('fail',soCreated.error,customerExternalId,customerAddedInNetSuite.ns_customer_id,'');
                }
                //success
                else{
                    return returnResponse('success',soCreated.error,customerExternalId,customerAddedInNetSuite.ns_customer_id,soCreated.saleOrderId);
                }
            }
            //fail
            else{
                return returnResponse('fail',customerAddedInNetSuite.error.name,customerAddedInNetSuite.error.externalId,'','');
            }
        }
        //create SO, because customer already exists
        else{
            let soCreated = createSalesOrderInNetSuite(customerExists,scriptObj);
            //fail
            if(soCreated.error){
                return returnResponse('fail',soCreated.error,customerExternalId,customerExists.toString(),'');
            }
            //success
            else{
                return returnResponse('success',soCreated.error,customerExternalId,customerExists.toString(),soCreated.saleOrderId);
            }
        }
    } catch (error) {
        log.error('Error : In Process Function',error);
        return returnResponse('fail','ERROR_IN_PROCESS_FUNCTION','','','');
    }
}