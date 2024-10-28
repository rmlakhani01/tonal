/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
/*************************************************************
 * File Header
 * Script Type : Restlet Script
 * Script Name : Tonal Rst Create Bulk Ship Confirm Staging
 * File Name   : Tonal_Rst_Create_Bulk_Ship_Confirm_Staging.js
 * Description : This script is used for creation of BO Ship Confirm record and invoked form MuleSoft
 * Created On  : 05/01/2023
 * Modification Details:  
 ************************************************************/
define(["N/record"], function(record) {

    function createBulkShipConfirmStaging(context) {
        try {
            var responseObj = new Object();
            var payload = context;
            log.debug('payload==',payload);
            var limit = payload.limit;
            var boshipconfirmData = payload.bulk_ship_confirm_staging_data;
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
            if(!boshipconfirmData){
                responseObj.status = 0;
                responseObj.message = 'fail';
                responseObj.details = [{message:'please provide bulk ship confirm staging data',bulk_ship_confirm_staging_data:[]}];
                log.debug('resposeObj==',responseObj);
                return responseObj;
            }
            //process the bo staging data 
            log.debug('boshipconfirmData.length==',boshipconfirmData.length);
            if(boshipconfirmData.length > 0){
                var nsBosCreatedDetails = [{success:[],fail:[]}];
                for(var c in boshipconfirmData){
                    //create shipconfirm staging record
                    var nsBosCreated = createNSBStagingRecord(boshipconfirmData[c]);
                    //success
                    if(typeof(nsBosCreated) == 'number'){
                        nsBosCreatedDetails[0].success.push({ns_bulk_ship_confirmation_staging_id:nsBosCreated,bulk_ship_confirmation_name:boshipconfirmData[c].name});
                    }
                    //fail
                    else if(typeof(nsBosCreated) == 'object'){
                        nsBosCreatedDetails[0].fail.push({fail:nsBosCreated,bulk_ship_confirmation_name:boshipconfirmData[c].name});
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
                responseObj.details = [{message:'no data avilable for process',bulk_ship_confirm_staging_data:[]}];
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
    function createNSBStagingRecord(data){
        try {
            var boscObj = record.create({
                type: 'customrecord_ship_confirm_staging',
                isDynamic: true
            });

            //set externalid
            boscObj.setValue('externalid',data.external_id);

            //set name
            boscObj.setValue('name',data.name);

            //set header
            boscObj.setValue('custrecord_stg_sc_header',JSON.stringify(data.ship_confirm_header));

            //set line
            boscObj.setValue('custrecord_stg_sc_lines',JSON.stringify(data.ship_confirm_lines));

            //set file name
            boscObj.setValue('custrecord_stg_sc_file_name',data.file_name);

            //set status
            boscObj.setValue('custrecord_stg_sc_status',1);//pending

            var boscId = boscObj.save();
            if(boscId){
                log.debug('New Bulk Ship Confirm Staging Created Sucessfully!!',boscId);
                return Number(boscId);
            }
        } catch (error) {
            log.error('Error : In Create NS BSC Staging Record',error);
            return {message:error.message,name:error.name};
        }
    }

    return {
        post: createBulkShipConfirmStaging
    }
});