/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal MR Reprocess Kit Conversion
 * File Name   : Tonal_MR_Reprocess_Kit_Conversion.js
 * Description : This script is used for create work order and assembly build for the kit conversion by taking the 
 * data fromm tha Work Order Staging Table with status partial and fail which arepassed by Suitelet
 * Created On  : 27/12/2022
 * Modification Details:  
 ************************************************************/
define(["N/runtime","N/record","N/search"], function(runtime,record,search) {

    function getInputData() {
        try {
            var scriptObj = runtime.getCurrentScript();
            var data = scriptObj.getParameter('custscript_staging_data_reprocess');
            var subsidiary = scriptObj.getParameter('custscript_woab_subsidiary');
            log.debug('subsidiary=='+subsidiary,'data=='+data);
            if(!data || !subsidiary){
                return [];
            }
            return JSON.parse(data);
        } catch (error) {
            log.error('Error : In Get Input Satge',error);
            return [];
        }
    }

    function reduce(context) {
        try {
            log.debug('reduceContext==',context);
            // return;
            var error_message = '';
            var key = context.key;
            var data = JSON.parse(context.values[0]);
            var recId = data.staging_rec_id;
            //get the subsidiary form the script parameter(for now it is by default 1)
            var subsidiary = runtime.getCurrentScript().getParameter('custscript_woab_subsidiary');
            var location = data.location;//location
            var assemblyItem = data.assembly_item;//assembly item
            var quantity = data.quantity;//quantity
            var name = data.job_number;//name
            var jobNumber = data.job_number;//job number
            var date = data.date//date
            var wo = data.work_order//workorder

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

            log.debug('wo==',wo);

            //if work order already created only create assembly build
            if(wo != '-NA-'){
                log.debug('Creating AB,WO Already Created','Case 1');
                //update the WO with the updated data
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
                    var woAb = createAssemblyBuild(wo,location,date,jobNumber,quantity);
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

            //create work order and assembly build
            if(wo == '-NA-'){
                log.debug('Creating AB,WO both','Case 2');
                var woId = createWorkOrderInNetSuite(data,subsidiary);
                if(typeof(woId) != 'string' && typeof(woId) != 'object'){
                    //update work order details on staging record and status as partial failure
                    var workOrderStagingIdPartialUpdate = record.submitFields({
                        type: 'customrecord_kit_conversion_staging',
                        id: recId,
                        values: {
                            custrecord_stg_kc_status:3,
                            custrecord_stg_kc_ns_work_order:woId,
                            custrecord_stg_kc_process_date:new Date()
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
                            id: recId,
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
            log.error('Error : In Reduce Satge',error);
            //update stagging tabel with staus fail
            record.submitFields({
                type: 'customrecord_kit_conversion_staging',
                id: recId,
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
                if(JSON.parse(value).success == 'partially'){
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
            log.error('Error : In Summarize',error);
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

            //set job number
            woObj.setValue('custbody_tonal_extronjn',data.job_number);

            //set externalId
            woObj.setValue('externalid',data.job_number+'_wo');//(jobnumber_wo)

            //set assembly item
            var itemId = getItemDetails(data.assembly_item);
            if(itemId == false){
                return 'Assembly Item Not Found'
            }
            woObj.setValue('assemblyitem',itemId);

            //set location
            var locationId =  getLocationDetails(data.location);
            if(locationId == false){
                return 'Location Not Found'
            }
            woObj.setValue('location',locationId);

            //set qunatity
            woObj.setValue('quantity',data.quantity);

            //set tran date
            var t_date = data.date;
          
            woObj.setText('trandate',t_date);

            var woId = woObj.save();
            log.debug('New WorkOrder Created For|| Job - '+data.job_number,'Wor Order Id||'+woId);
            return woId;
            
        } catch (error) {
            log.error('Error : In Create Work Order In NetSuite',error);
            //check for the message string length
            var err = error.message;
            if(err.length > 300){
                err = err.split('.')[0];s
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

            //set job number
            assemblyObj.setValue('custbody_tonal_extronjn',jobNumber);

            //set externalId
            assemblyObj.setValue('externalid',jobNumber+'_ab');//(jobnumber_wo)

            //set qunatity
            assemblyObj.setValue('qunatity',quantity);

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
    
    //function to update the woek order in Netsuite
    function updatedWorkOrderInNetSuite(wo,data,subsidiary){
        try {
            var woObj = record.load({
                type:record.Type.WORK_ORDER,
                id: wo,
                isDynamic: true
            })
            //set subsidiary
            var subId = subsidiary;

            woObj.setValue('subsidiary',subId);

            //set job number
            woObj.setValue('custbody_tonal_extronjn',data.job_number);

            //set location
            var locationId =  getLocationDetails(data.location);
            if(locationId == false){
                return 'Location Not Found'
            }
            woObj.setValue('location',locationId);

            //set assembly item
            var itemId = getItemDetails(data.assembly_item);
            if(itemId == false){
                return 'Assembly Item Not Found'
            }
            woObj.setValue('assemblyitem',itemId);

            //set qunatity
            woObj.setValue('quantity',data.quantity);

            //set tran date
            var t_date = data.date;
          
            woObj.setText('trandate',t_date);

            var woId = woObj.save();
            log.debug('WorkOrder Updated For|| Job - '+data.job_number,'Wor Order Id||'+woId);
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
