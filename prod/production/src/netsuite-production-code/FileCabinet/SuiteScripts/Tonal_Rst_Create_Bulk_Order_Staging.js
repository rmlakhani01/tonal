/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Create Bulk Order staging
 * File Name   : Tonal_Rst_Create_Bulk_Order_staging.js
 * Description : This script is used forcreation of BO staging record and invoked form MuleSoft
 * Created On  : 05/01/2023
 * Modification Details:  
 ************************************************************/
define(["N/record"], function(record) {

    function createBulkOrderStaging(context) {
        try {
            var responseObj = new Object();
            var payload = context;
            log.debug('payload==',payload);
            var limit = payload.limit;
            var boStagingData = payload.bulk_order_staging_data;
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
            if(!boStagingData){
                responseObj.status = 0;
                responseObj.message = 'fail';
                responseObj.details = [{message:'please provide bulk order staging data',bulk_order_staging_data:[]}];
                log.debug('resposeObj==',responseObj);
                return responseObj;
            }
            //process the bo staging data 
            log.debug('boStagingData.length==',boStagingData.length);
            if(boStagingData.length > 0){
                var nsBosCreatedDetails = [{success:[],fail:[]}];
                for(var c in boStagingData){
                    //create bo staging record
                    var nsBosCreated = createNSBOStagingRecord(boStagingData[c]);
                    //success
                    if(typeof(nsBosCreated) == 'number'){
                        nsBosCreatedDetails[0].success.push({ns_bulk_staging_id:nsBosCreated,bulk_order_name:boStagingData[c].name});
                    }
                    //fail
                    else if(typeof(nsBosCreated) == 'object'){
                        nsBosCreatedDetails[0].fail.push({fail:nsBosCreated,bulk_order_name:boStagingData[c].name});
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
                responseObj.details = [{message:'no data avilable for process',bulk_order_staging_data:[]}];
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
    function createNSBOStagingRecord(data){
        try {
            var bosObj = record.create({
                type: 'customrecord_bulk_order_staging',
                isDynamic: true
            });

            //set externalid
            bosObj.setValue('externalid',data.external_id);

            //set name
            bosObj.setValue('name',data.name);

            //set header
            bosObj.setValue('custrecord_stg_bo_header',JSON.stringify(data.bulk_order_header));

            //set line
            bosObj.setValue('custrecord_stg_bo_lines',JSON.stringify(data.bulk_order_lines));

            //set status
            bosObj.setValue('custrecord_stg_bo_status',1);//pending

            //set file name
            bosObj.setValue('custrecord_stg_bo_file_name',data.file_name);

            var bosId = bosObj.save();
            if(bosId){
                log.debug('New Bulk Staging Created Sucessfully!!',bosId);
                return Number(bosId);
            }
        } catch (error) {
            log.error('Error : In Create NS BO Staging Record',error);
            return {message:error.message,name:error.name};
        }
    }

    return {
        post: createBulkOrderStaging
    }
});