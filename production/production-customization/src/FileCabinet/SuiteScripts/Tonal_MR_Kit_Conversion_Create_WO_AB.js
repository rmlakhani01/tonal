/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Kit Conversion Create WO AB
 * File Name   : Tonal_MR_Kit_Conversion_Create_WO_AB.js
 * Description : This script is used for create work order and assembly build for the kit conversion by taking the 
 * data fromm tha Work Order Staging Table
 * Created On  : 1/12/2022
 * Modification Details:  
 ************************************************************/
define(["N/runtime","N/search","N/record","N/format","N/query"], function(runtime,search,record,format,query) {

    function getInputData() {
        try {
            //get the script parameter details,get the work order stagig tabeldetails for creation of WO/AB 
            var scriptObj = runtime.getCurrentScript();
            var searchId = scriptObj.getParameter('custscript_wo_staging_data');
            var subsidiary = scriptObj.getParameter('custscript_wo_subsidiary');
            if(!searchId || !subsidiary){
                return [];
            }
            var searchObj =  search.load({
                id: searchId
            });
            return searchObj;
        } catch (error) {
            log.error('Error : In Get Input Stage',error);
            return [];
        }
    }

    function reduce(context) {
        try {
            var error_message = '';
            // log.debug('reduceContext==',context);
            // return;
            var key = context.key;
            var data = JSON.parse(context.values[0]);
            var recId = data.id;
            //get the subsidiary form the script parameter(for now it is by default 1)
            var subsidiary = runtime.getCurrentScript().getParameter('custscript_wo_subsidiary');
            var location = data.values.custrecord_stg_kc_location;//location
            var assemblyItem = data.values.custrecord_stg_kc_assembly_item;//assembly item
            var quantity = data.values.custrecord_stg_kc_quantity;//quantity
            var name = data.values.name;//name
            var jobNumber = data.values.custrecord_stg_kc_job_number;//job number
            var date = data.values.custrecord_stg_kc_date//date
            var wo = data.values.custrecord_stg_kc_ns_work_order//wo
            var ab = data.values.custrecord_stg_kc_ns_assembly_build//ab

            //validate for the mandatory fields
            if(!subsidiary){
                error_message = 'Kit Conversion Subsidiary Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!location){
                error_message = 'Kit Conversion Location Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!assemblyItem){
                error_message = 'Kit Conversion Assembly Item Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!quantity){
                error_message = 'Kit Conversion Assmebly Quantity Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!jobNumber){
                error_message = 'Kit Conversion Job Number Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!name){
                error_message = 'Kit Conversion Name Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }
            if(!date){
                error_message = 'Kit Conversion Date Missing';
				context.write({key:recId,value:{success:false, data:error_message}});
				return;
            }

            //Case1:
            //check for wo already created or not. If created update the WO with the updated staging data, else ccreate new wo,ab
            if(wo){
                log.debug('Case1','Running..');
                //Upate WO with the updated staging data
                var upWOId = updatedWorkOrderInNetSuite(wo,data,subsidiary);
                if(typeof(upWOId) != 'string' && typeof(upWOId) != 'object'){
                    //update work order details on staging record and status as partial failure
                    var workOrderStagingIdPartialUpdate = record.submitFields({
                        type: 'customrecord_kit_conversion_staging',
                        id: recId,
                        values: {
                            custrecord_stg_kc_status:3,
                            custrecord_stg_kc_ns_work_order:upWOId,
                            custrecord_stg_kc_process_date:new Date()
                        }
                    });
                    log.debug('Work Order Staging Process Partially Successfully||',workOrderStagingIdPartialUpdate);
                    var woAb = createAssemblyBuild(wo.value,location,date,jobNumber,quantity);
                    if(typeof(woAb) == 'object' || typeof(woAb) == 'string'){
                        error_message = woAb;
                        context.write({key:recId,value:{success:'partially', data:error_message}});
                        return;
                    }else{
                        //update process sucess flag in workorder staging table
                        var workOrderStagingId = record.submitFields({
                            type: 'customrecord_kit_conversion_staging',
                            id: recId,
                            values: {
                                custrecord_stg_kc_status:2,
                                custrecord_stg_kc_ns_assembly_build:woAb,
                                custrecord_stg_kc_process_date:new Date(),
                                custrecord_stg_kc_error_message:''
                            }
                        });
                        log.debug('Work Order Staging Process Successfully||'+workOrderStagingId,JSON.stringify({wo_id:wo,assembly_build:woAb,wo_stagging:workOrderStagingId}));
                    }
                }
                else{
                    error_message = upWOId;
                    context.write({key:recId,value:{success:false, data:error_message}});
                    return;
                }
            }
            //Case2:
            else if(!wo){
                log.debug('Case2','Running..');
                //create work order then assembly build
                var woId = createWorkOrderInNetSuite(data,subsidiary);
                if(typeof(woId) != 'string' && typeof(woId) != 'object'){
                    //update work order details on staging record and status as partial failure
                    var workOrderStagingIdPartialUpdate = record.submitFields({
                        type: 'customrecord_kit_conversion_staging',
                        id: key,
                        values: {
                            custrecord_stg_kc_status:3,
                            custrecord_stg_kc_ns_work_order:woId,
                            custrecord_stg_kc_process_date:new Date(),
                            custrecord_stg_kc_error_message:''
                        }
                    });
                    log.debug('Work Order Staging Process Partially Successfully||',workOrderStagingIdPartialUpdate);
                    var woAb = createAssemblyBuild(woId,location,date,jobNumber,quantity);
                    if(typeof(woAb) == 'object' || typeof(woAb) == 'string'){
                        error_message = woAb;
                        context.write({key:recId,value:{success:'partially', data:error_message}});
                        return;
                    }else{
                        //update process sucess flag in workorder staging table
                        var workOrderStagingId = record.submitFields({
                            type: 'customrecord_kit_conversion_staging',
                            id: key,
                            values: {
                                custrecord_stg_kc_status:2,
                                custrecord_stg_kc_ns_assembly_build:woAb,
                                custrecord_stg_kc_process_date:new Date(),
                                custrecord_stg_kc_error_message:''
                            }
                        });
                        log.debug('Work Order Staging Process Successfully||'+workOrderStagingId,JSON.stringify({wo_id:woId,assembly_build:woAb,wo_stagging:workOrderStagingId}));
                    }
                }else{
                    error_message = woId;
                    context.write({key:recId,value:{success:false, data:error_message}});
                    return;
                }
            }

        } catch (error) {
            log.error('Error : In Reduce Stage',error);
            //update stagging tabel with staus fail
            record.submitFields({
                type: 'customrecord_kit_conversion_staging',
                id: key,
                values: {
                    custrecord_stg_kc_status:4,
                    custrecord_stg_kc_error_message:error.message,
                    custrecord_stg_kc_process_date:new Date()
                }
            });
        }
    }

    function summarize(summary) {
        try {
            summary.output.iterator().each(function (key, value) {
                log.debug({
                    title: 'Kit Conversion',
                    details: 'key: ' + key + ' / value: ' + value
                });
                //update staging table error message and status failed
                //check the value containt for partial sucess
                // log.debug('JSON.parse(value).success==',JSON.parse(value).success);
                if(JSON.parse(value).success == 'partially'){
                    JSON.parse(value).success = false;
                    record.submitFields({
                        type: 'customrecord_kit_conversion_staging',
                        id: key,
                        values: {
                            custrecord_stg_kc_status:3,
                            custrecord_stg_kc_error_message:value,
                            custrecord_stg_kc_process_date:new Date()
                        }
                    });
                }
                else{
                    record.submitFields({
                        type: 'customrecord_kit_conversion_staging',
                        id: key,
                        values: {
                            custrecord_stg_kc_status:4,
                            custrecord_stg_kc_error_message:value,
                            custrecord_stg_kc_process_date:new Date()
                        }
                    });
                }
                return true;
            });
        } catch (error) {
            log.error('Error : In Summarize Stage',error);
        }
    }

    //function to create the workorder in netsuite
    function createWorkOrderInNetSuite(data,subsidiary){
        try {
            var woObj = record.create({
                type: record.Type.WORK_ORDER,
                isDynamic: true
            });

            //set subsidiary
            var subId = subsidiary;

            woObj.setValue('subsidiary',subId);

            //set externalId
            woObj.setValue('externalid',data.values.custrecord_stg_kc_job_number+'_wo');//(jobnumber_wo)

            //set jobnumber
            woObj.setValue('custbody_tonal_extronjn',data.values.custrecord_stg_kc_job_number);

            //set assembly item
            var itemId = getItemDetails(data.values.custrecord_stg_kc_assembly_item);
            if(itemId == false){
                return 'Assembly Item Not Found'
            }
            woObj.setValue('assemblyitem',itemId);

            //set location
            var locationId =  getLocationDetails(data.values.custrecord_stg_kc_location);
            log.debug('woLocationId==',locationId);
            if(locationId == false){
                return 'Location Not Found'
            }
            woObj.setValue('location',locationId);
            // log.debug('setwoLocation',woObj.getValue('location'));

            //set qunatity
            woObj.setValue('quantity',data.values.custrecord_stg_kc_quantity);

            //set tran date
            var t_date = data.values.custrecord_stg_kc_date;
           /*  log.debug('t_datebefore==',t_date);
            t_date = nsFormatDate(t_date);
            log.debug('t_dateafter==',t_date); */
            woObj.setText('trandate',t_date);

            var woId = woObj.save();
            log.debug('New WorkOrder Created For|| Job - '+data.values.custrecord_stg_kc_job_number,'Wor Order Id||'+woId);
            return woId;
            
        } catch (error) {
            log.error('Error : In Create Work Order In NetSuite',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 300){
                err = err.split('.')[0];
            }
            return err;
        }
    }

    //function  to create the assembly build
    function createAssemblyBuild(workOrderId,location,date,jobNumber,quantity){
        try {
            var assemblyObj = record.transform({
                fromType: record.Type.WORK_ORDER,
                fromId: workOrderId,
                toType: record.Type.ASSEMBLY_BUILD,
                isDynamic: true
            });

            //set externalId
            assemblyObj.setValue('externalid',jobNumber+'_ab');//(jobnumber_ab)

            //set job number
            assemblyObj.setValue('custbody_tonal_extronjn',jobNumber);

            //set qunatity
            assemblyObj.setValue('quantity',quantity);

            //set location
            var locId = getLocationDetails(location);
            if(locId == false){
                return 'Location Not Found';
            }
            assemblyObj.setValue('location',locId);

            //set trandate
            assemblyObj.setText('trandate',date);

            var assemblyId = assemblyObj.save();
            log.debug('New Assembly Build Create For Work Order||'+workOrderId,'Assembly Build Id||'+assemblyId);
            return assemblyId;
        } catch (error) {
            log.error('Error : In Create Assembly Build',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 300){
                err = err.split('.')[0];
            }
            return err;
        }
    }

    //function to get the subsidiary details
    function getSubsidiaryDetails(subName){
        try {
            var subsidiarySearchObj = search.create({
                type: "subsidiary",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["name","is",subName]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "city", label: "City"}),
                   search.createColumn({name: "state", label: "State/Province"}),
                   search.createColumn({name: "country", label: "Country"}),
                   search.createColumn({name: "currency", label: "Currency"})
                ]
             });
            var searchResultCount = subsidiarySearchObj.runPaged().count;
            var subId = false;
            log.debug("subsidiary count",searchResultCount);
            subsidiarySearchObj.run().each(function(result){
                subId = result.id
                return true;
            });
            return subId;
        } catch (error) {
            log.error('Error : In Get Subsidiary Details',error);
            return false;
        }
    }

    //function to get the item details
    function getItemDetails(itemSku){
        try {
            var assemblyitemSearchObj = search.create({
                type: "assemblyitem",
                filters:
                [
                   ["type","anyof","Assembly"], 
                   "AND", 
                   ["isinactive","is","F"], 
                   "AND", 
                //    ["name","is",itemSku]
                   ["externalid","is",itemSku]
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
                   search.createColumn({name: "baseprice", label: "Base Price"})
                ]
            });
            var searchResultCount = assemblyitemSearchObj.runPaged().count;
            log.debug("assemblyitem count",searchResultCount);
            var itemId = false;
            assemblyitemSearchObj.run().each(function(result){
                itemId = result.id;
                return true;
            });
            return itemId;
        } catch (error) {
            log.error('Error : In Get ItemDetails',error);
            return false;
        }
    }

    //function to get the location details
    function getLocationDetails(locName){
        try {
            var locationSearchObj = search.create({
                type: "location",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                //    ["name","is",locName]
                   ["externalid","is",locName]
                ],
                columns:
                [
                   search.createColumn({
                      name: "name",
                      sort: search.Sort.ASC,
                      label: "Name"
                   }),
                   search.createColumn({name: "phone", label: "Phone"}),
                   search.createColumn({name: "city", label: "City"}),
                   search.createColumn({name: "state", label: "State/Province"}),
                   search.createColumn({name: "country", label: "Country"}),
                   //search.createColumn({name: "custrecordwoo_retail_store_key", label: "WooCommerce Retail Store KEY"}),
                   //search.createColumn({name: "custrecord_so_dept", label: "Sales Department  "})
                ]
            });
            var searchResultCount = locationSearchObj.runPaged().count;
            log.debug("location count",searchResultCount);
            var locId = false;
            locationSearchObj.run().each(function(result){
                locId = result.id;
                return true;
            });
            return locId;
        } catch (error) {
            log.error('Error : In Get Location Details',error);
            return false;
        }
    }

    //function to get the customer details
    function getCustomerDetails(custName){
        try {
            var customerSearchObj = search.create({
                type: "customer",
                filters:
                [
                   ["isinactive","is","F"], 
                   "AND", 
                   ["companyname","is",custName]
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
                   search.createColumn({name: "phone", label: "Phone"}),
                   search.createColumn({name: "altphone", label: "Office Phone"}),
                   search.createColumn({name: "fax", label: "Fax"}),
                   search.createColumn({name: "contact", label: "Primary Contact"}),
                   search.createColumn({name: "altemail", label: "Alt. Email"})
                ]
            });
            var searchResultCount = customerSearchObj.runPaged().count;
            log.debug("customer count",searchResultCount);
            var custId = false;
            customerSearchObj.run().each(function(result){
                custId = result.id;
                return true;
            });
            return custId; 
        } catch (error) {
            log.error('Error : In Get Customer Details',error);
            return false;
        }
    }

    //function to get the NS format date
    function nsFormatDate(date){
        try {
            return format.format({
                value: date,
                type: format.Type.DATE
            });
        } catch (error) {
            log.error('Error : In NS Format Date',error);
        }
    }  

    //function tocheck the close accounting periods(AP/AR)
    function checkPostingPeriodStatus(date){
        try {
            var results = query.runSuiteQL({
                query: "SELECT AccountingPeriod.ID,AccountingPeriod.StartDate,AccountingPeriod.EndDate,AccountingPeriod.ARLocked,AccountingPeriod.APLocked FROM AccountingPeriod WHERE (AccountingPeriod.IsInactive='F') AND (AccountingPeriod.ARLocked='T') AND (AccountingPeriod.APLocked='T') AND (TO_DATE('"+date+"','YYYY-MM-DD') BETWEEN AccountingPeriod.StartDate AND AccountingPeriod.EndDate)"
            });
            return results.asMappedResults();
        } catch (error) {
            log.error('Error : In Check Posting Period Status',error);
            return false;
        }
    }

    //function to update the woek order in Netsuite
    function updatedWorkOrderInNetSuite(wo,data,subsidiary){
        try {
            var woObj = record.load({
                type:record.Type.WORK_ORDER,
                id: wo.value,
                isDynamic: true
            })
            //set subsidiary
            var subId = subsidiary;

            woObj.setValue('subsidiary',subId);

            //set externalId
            woObj.setValue('externalid',data.values.custrecord_stg_kc_job_number+'_wo');//(jobnumber_wo)

            //set job number
            woObj.setValue('custbody_tonal_extronjn',data.values.custrecord_stg_kc_job_number);

            //set location
            var locationId =  getLocationDetails(data.values.custrecord_stg_kc_location);
            if(locationId == false){
                return 'Location Not Found'
            }
            woObj.setValue('location',locationId);

            //set assembly item
            var itemId = getItemDetails(data.values.custrecord_stg_kc_assembly_item);
            if(itemId == false){
                return 'Assembly Item Not Found'
            }
            woObj.setValue('assemblyitem',itemId);

            //set qunatity
            woObj.setValue('quantity',data.values.custrecord_stg_kc_quantity);

            //set tran date
            var t_date = data.values.custrecord_stg_kc_date;
          
            woObj.setText('trandate',t_date);

            var woId = woObj.save();
            log.debug('WorkOrder Updated For|| Job - '+data.values.custrecord_stg_kc_job_number,'Wor Order Id||'+woId);
            return woId;
        } catch (error) {
            log.error('Error : In update Work Order In NetSuite',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 300){
                err = err.split('.')[0];s
            }
            return err;
        }
    }

    return {
        getInputData: getInputData,
        reduce: reduce,
        summarize: summarize
    }
});
