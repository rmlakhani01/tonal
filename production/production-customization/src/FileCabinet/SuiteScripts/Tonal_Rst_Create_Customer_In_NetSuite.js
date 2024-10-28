/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Create Customer In NetSuite
 * File Name   : Tonal_Rst_Create_Customer_In_NetSuite.js
 * Description : This script is used for creating customer in NetSuite
 * Created On  : 25/05/2023
 * Modification Details:  
 ************************************************************/
define(["N/record","N/search","N/runtime"], function(record,search,runtime) {

    function createCustomerInNetSuite(context) {
        try {
            var scriptObj = runtime.getCurrentScript();
            var customForm = scriptObj.getParameter('custscript_tnl_custom_customer_form');
            log.debug('customForm==',customForm);
            if(!customForm){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'MISSING_CUSTOM_FORM',
                        message:'Please provide custom formin script parameter in NetSuite.',
                    }
                };
            }
            var payload = context;
            log.debug('payload==',payload);
            if(!payload){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'INVALID_PAYLOAD',
                        message:'Please provide data to create customer.'
                    }
                };
            }

            var customer = payload.Customer;
            if(!customer){
                return {
                    status:0,
                    message:'fail',
                    details:{
                        error:'INVALID_PAYLOAD',
                        message:'Please provide customer data to create customer.'
                    }
                };
            }

            //create customer in netsuite
            var customerAddedInNetSuite = addCustomerInNetSuite(customer,customForm);
            log.debug('customerAddedInNetSuite==',customerAddedInNetSuite);

            //success
            if(customerAddedInNetSuite.success == true && customerAddedInNetSuite.data !='Customer Already Exists In NetSuite'){
                return{
                    status:1,
                    message:'success',
                    details:{
                        ns_customer_id:customerAddedInNetSuite.ns_customer_id,
                        data:customerAddedInNetSuite.data
                    }
                };
            }
            //fail
            else{
                return{
                    status:0,
                    message:'fail',
                    details:{
                        error:customerAddedInNetSuite.error.name,
                        message:customerAddedInNetSuite.error.message,
                        externalId:customerAddedInNetSuite.externalId
                    }
                };
            }
        } catch (error) {
            log.error('Main Exception',error);
            return {
                status:0,
                message:'fail',
                details:{
                    error:error.name,
                    message:error.message,
                    externalId:data.externalId
                }
            };
        }
    }

    //function to create the new customer in netsuite
    function addCustomerInNetSuite(data,customform){
        try {
            var custObj = record.create({
                type: record.Type.CUSTOMER,
                isDynamic: true
            });

            custObj.setValue('customform',customform);

            var externalId = data.externalId;
            var firstName = data.firstName;
            var lastName = data.lastName;
            var midName = data.midName;
            var isIndividual = data.isIndividual;
            // var subsidiary = data.subsidiary.id;
            // var email = data.email;
            // log.debug('MandatoryData==',JSON.stringify({first_name:firstName,is_individual:isIndividual,subsidiary:subsidiary,email:email}));

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
                        message:'Isindividual is missing',
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

               /*  //parent company
                if(data.parent.id){
                    custObj.setValue('hasparent', 'T');
                    custObj.setValue('parent', data.parent.id);
                } */
                   
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

            //parent company
            if(data.parent){
                custObj.setValue('hasparent', true);
                custObj.setValue('parent', data.parent.id);
            }

            //status
            if(data.status)
            custObj.setValue('entitystatus',data.status.id); 
            
            //customer type
            if(data.custentity_customer_type)
            custObj.setValue('custentity_customer_type',data.custentity_customer_type);

            //category
            var customerCategoryMap = {
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

            //order priority
            if(data.orderPriority)
            custObj.setValue('defaultorderpriority',data.orderPriority);

            //comments
            if(data.comments)
            custObj.setValue('comments',data.comments);

            //salesrep
            if(data.salesRep)
            custObj.setValue('salesrep',data.salesRep);

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
                var currentAddressCount = custObj.getLineCount({
                    'sublistId': 'addressbook'
                });
              
                //loop over all the address object to set it as multiple address
                if(data.address.length > 0){

                    for(var a in data.address){

                        var addressDetails = data.address[a];

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
    
                        var addressSubrecord = custObj.getCurrentSublistSubrecord({
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

            /* var newCustId = '';
            
            //check customer already avilable in netsuiet
            var cusomerExixts = getCustomerAlreadyExistsInNetSuite(data.email);
            log.debug('cusomerExixts==',cusomerExixts);
            if(cusomerExixts == 0){
                newCustId = custObj.save();

                if(newCustId){
                    return{
                        success:true,
                        ns_customer_id:newCustId,
                        data:data
                    };
                }
            }
            else{
                newCustId = cusomerExixts;

                if(newCustId){
                    return{
                        success:true,
                        ns_customer_id:newCustId,
                        data:'Customer Already Exists In NetSuite'
                    };
                }
            }  */

            var newCustId = custObj.save();
            if(newCustId){
                //load the customer and set the deaultshipping and defaultbilling for the first line of address as came from the first address object in array
                if(data.address && data.address.length > 0){
                    var customerObj = record.load({
                        type: 'customer',
                        id: newCustId,
                        isDynamic: true
                    });

                    customerObj.selectLine({
                        sublistId: 'addressbook',
                        line: 0
                    });

                    var addressData = data.address[0];

                    var def_shipping = addressData.defaultShipping;
                    var def_billing = addressData.defaultBilling;

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

                    var updatedCustomerId = customerObj.save();
                    if(updatedCustomerId){
                        log.debug('Customer Updated With Correct Shipping And Billing Data','Ok..');
                    }

                }

                return{
                    success:true,
                    ns_customer_id:newCustId,
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
    function getCustomerAlreadyExistsInNetSuite(email){
        try {
            var customerSearchObj = search.create({
                type: "customer",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["email","is",email]
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
            var searchResultCount = customerSearchObj.runPaged().count;
            log.debug("Customer Count",searchResultCount);
            var customerId = searchResultCount;
            customerSearchObj.run().each(function(result){
                customerId = result.id;
                return true;
            });
            return customerId;
        } catch (error) {
            log.error('Error : In Get Cutomer Already Exists',error);
            return 1;
        }
    }

    return {
        post: createCustomerInNetSuite
    }
});
