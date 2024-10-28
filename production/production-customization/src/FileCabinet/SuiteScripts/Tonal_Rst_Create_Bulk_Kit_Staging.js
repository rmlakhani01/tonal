/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Create Bulk Kit staging
 * File Name   : Tonal_Rst_Create_Bulk_Kit_Staging.js
 * Description : This script is used for creation of BO Kitting record and invoked form MuleSoft
 * Created On  : 05/01/2023
 * Modification Details:  
 ************************************************************/
define(["N/record"], function(record) {

    function createBulkKittingStaging(context) {
        try {
            var responseObj = new Object();
            var payload = context;
            log.debug('payload==',payload);
            var limit = payload.limit;
            var bokittingData = payload.bulk_kitting_staging_data;
            if(!limit){
                limit = 500//default
            }
            if(limit > 500 || limit <= 0){
                responseObj.status = 0;
                responseObj.message = 'fail';
                responseObj.details = [{message:'please adjust limit',limit:limit}];
                log.debug('resposeObj==',responseObj);
                return responseObj;
            }
            if(!bokittingData){
                responseObj.status = 0;
                responseObj.message = 'fail';
                responseObj.details = [{message:'please provide bulk order staging data',bulk_order_staging_data:[]}];
                log.debug('resposeObj==',responseObj);
                return responseObj;
            }
            //process the bo staging data 
            log.debug('bokittingData.length==',bokittingData.length);
            if(bokittingData.length > 0){
                var nsBosCreatedDetails = [{success:[],fail:[]}];
                for(var c in bokittingData){
                    //create kitting staging record
                    var nsBosCreated = createNSBKStagingRecord(bokittingData[c]);
                    //success
                    if(typeof(nsBosCreated) == 'number'){
                        nsBosCreatedDetails[0].success.push({ns_bulk_kitting_staging_id:nsBosCreated,bulk_kitting_name:bokittingData[c].name});
                    }
                    //fail
                    else if(typeof(nsBosCreated) == 'object'){
                        nsBosCreatedDetails[0].fail.push({fail:nsBosCreated,bulk_kitting_name:bokittingData[c].name});
                    }
                }
                if(nsBosCreatedDetails.length > 0){
                    responseObj.status = 1;
                    responseObj.message = 'success';
                    responseObj.details = [{message:'success',data:nsBosCreatedDetails}];
                    log.debug('resposeObj==',responseObj);
                    return responseObj;
                }
            }
            else{
                responseObj.status = 0;
                responseObj.message = 'fail';
                responseObj.details = [{message:'no data avilable for process',bulk_kitting_staging_data:[]}];
                log.debug('resposeObj==',responseObj);
                return responseObj;
            }
        } catch (error) {
            log.error('Main Exception',error);
            responseObj.status = 0;
            responseObj.message = 'fail';
            responseObj.details = [{message:'error',data:error}];
            log.debug('resposeObj==',responseObj);
            return responseObj;
        }
    }

    //function to create the bo staging record in NS
    function createNSBKStagingRecord(data){
        try {
            var bokObj = record.create({
                type: 'customrecord_kit_conversion_staging',
                isDynamic: true
            });

            //set externalid
            bokObj.setValue('externalid',data.external_id);

            //set name
            bokObj.setValue('name',data.name);

            //set jobnumber
            bokObj.setValue('custrecord_stg_kc_job_number',data.job_number);

            //set location
            bokObj.setValue('custrecord_stg_kc_location',data.location);

            //set assembly item
            bokObj.setValue('custrecord_stg_kc_assembly_item',data.assembly_item);

            //set date
            bokObj.setText('custrecord_stg_kc_date',data.date);

            //set qty
            bokObj.setValue('custrecord_stg_kc_quantity',data.quantity);

            //set components
            bokObj.setValue('custrecord_stg_kc_component',JSON.stringify(data.components));

            //set file name
            bokObj.setValue('custrecord_stg_kc_file_name',data.file_name);

            //set status
            bokObj.setValue('custrecord_stg_kc_status',1);//pending

            var bokId = bokObj.save();
            if(bokId){
                log.debug('New Bulk Kitting Staging Created Sucessfully!!',bokId);
                return Number(bokId);
            }
        } catch (error) {
            log.error('Error : In Create NS BK Staging Record',error);
            return {message:error.message,name:error.name};
        }
    }

    return {
        post: createBulkKittingStaging
    }
});