/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
/*************************************************************
 * File Header
 * Script Type : Schedule Script
 * Script Name : Tonal SCH Email BO SC 24Hrs Staging Not Created
 * File Name   : Tonal_SCH_Email_BO_SC_24Hrs_Staging_Not_Created.js
 * Description : This script is used for send the email for staging not created in 24hrs
 * Created On  : 03/07/2023
 * Modification Details:  
 ************************************************************/
define(["N/search","N/runtime","N/email"], function(search,runtime,email) {

    function sendEmailAlertForStagingNotCreatedIn24Hrs(context) {
        try {
            //get the search id from script parameter
            var scriptObj = runtime.getCurrentScript();
            var searchIdSCS = scriptObj.getParameter('custscript_stg_sc');
            var searchIdBOS = scriptObj.getParameter('custscript_stg_bo');
            var emailSender = scriptObj.getParameter('custscript_stgboso_error_email_sender');
            var emailReceiver = scriptObj.getParameter('custscript_stgboso_error_email_receiver');
            if(!searchIdSCS || !searchIdBOS || !emailSender || !emailReceiver){
                log.debug('MISSING_SCRIPT_PARAMETERS',JSON.stringify({search_bo:searchIdBOS,search_sc:searchIdSCS,email_sender:emailSender,email_receiver:emailReceiver}));
                return;
            }

            //load and run the search if result is zeror then send email alert 
            var SCCount = Number(0),BOCount = Number(0);
            if(searchIdSCS){
                var searchObjSC =  search.load({
                    id: searchIdSCS
                });
                var resultSetSC = searchObjSC.run();
    
                // now take the first portion of data.
                var currentRangeSC = resultSetSC.getRange({
                    start : 0,
                    end : 1000
                });
                log.debug('scCount',currentRangeSC.length);
                if(currentRangeSC.length == 0){
                    SCCount = Number(0);
                }
                else{
                    SCCount = currentRangeSC.length;
                }
            }
            if(searchIdBOS){
                var searchObjBO =  search.load({
                    id: searchIdBOS
                });
                var resultSetBO = searchObjBO.run();
    
                // now take the first portion of data.
                var currentRangeBO = resultSetBO.getRange({
                    start : 0,
                    end : 1000
                });
                log.debug('boCount',currentRangeBO.length);
                if(currentRangeBO.length == 0){
                    BOCount = Number(0);
                }
                else{
                    BOCount = currentRangeBO.length;
                }
            }

            log.debug('SCCount=='+SCCount,'BOCount=='+BOCount);

            if(SCCount == Number(0)){
                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>There have not been any new Ship Confirm Staging records synced from the SFTP server to NetSuite since yestarday. Please investigate the root cause of the lack of activities.<br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Ship Confirmation Staging Not Created Since Yestarday'
                });

                log.debug('Email Sent For Ship Confirmation Stgaing Not Created For 24Hrs','Ok');
            }
            if(BOCount == Number(0)){
                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>There have not been any new Bulk Staging records synced from the SFTP server to NetSuite since yestarday. Please investigate the root cause for lack of activities. <br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Bulk Order Staging Not Created Since Yestarday'
                });

                log.debug('Email Sent For BO Staging Not Created For 24Hrs','Ok');
            }

        } catch (error) {
            log.error('Main Exception',error);
        }
    }

    return {
        execute: sendEmailAlertForStagingNotCreatedIn24Hrs
    }
});
