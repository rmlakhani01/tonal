/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce Script
 * Script Name : Tonal SCH Email KC Failed Details
 * File Name   : Tonal_SCH_Email_KC_Failed_Details.js
 * Description : This script is used for send the email for failed KC
 * Created On  : 02/24/2023
 * Modification Details:  
 ************************************************************/
define(["N/search","N/runtime","N/email","N/file"], function(search,runtime,email,file) {

    function sendKCErrorDetails(context) {
        try {
            //get the search id from script parameter
            var scriptObj = runtime.getCurrentScript();
            var searchId = scriptObj.getParameter('custscript_error_kc_data');
            var emailSender = scriptObj.getParameter('custscript_kc_error_email_sender');
            var emailReceiver = scriptObj.getParameter('custscript_kc_error_email_receiver');
            if(!searchId || !emailSender || !emailReceiver){
                log.debug('MISSING_SCRIPT_PARAMETERS',JSON.stringify({search_id:searchId,email_sender:emailSender,email_receiver:emailReceiver}));
                return;
            }
            var searchObj =  search.load({
                id: searchId
            });

            var resultSet = searchObj.run();

            // now take the first portion of data.
            var currentRange = resultSet.getRange({
                start : 0,
                end : 1000
            });

            var i = 0;  // iterator for all search results
            var j = 0;  // iterator for current result range 0..999

            var data = [];

            while (j < currentRange.length) {
                // take the result row
                var result = currentRange[j];
                // and use it like this....
                var internalId = result.id;
                data.push({
                    internal_id:result.id,
                    date:result.getValue('custrecord_stg_kc_date'),
                    job_number:result.getValue('custrecord_stg_kc_job_number'),
                    assembly_item:result.getValue('custrecord_stg_kc_assembly_item'),
                    qunatity:result.getValue('custrecord_stg_kc_quantity'),
                    work_order:result.getText('custrecord_stg_kc_ns_work_order'),
                    location:result.getValue('custrecord_stg_kc_location'),
                    error_message:result.getValue('custrecord_stg_kc_error_message'),
                    file_name:result.getValue('custrecord_stg_kc_file_name'),
                    date_created:result.getValue('created')
                })
                // finally:
                i++; j++;
                if(j == 1000 ) {   // check if it reaches 1000
                    j = 0;          // reset j an reload the next portion
                    currentRange = resultSet.getRange({
                        start : i,
                        end : i + 1000
                    });
                }
            }
            log.debug('dataCount=='+data.length,'data=='+JSON.stringify(data));
            if(data.length > 0){
                var csvData = data;
                //CSV Header
                var csvFile = 'Internal Id,Date,Job Number,Assembly Item,Qunatity, Work Order, Location, Error Message, File Name, Date Created\r\n';
                for(var c in csvData){
                    //Add each result as a new line on CSV
                    csvFile += csvData[c].internal_id+','+csvData[c].date+','+csvData[c].job_number+','+csvData[c].assembly_item+','+csvData[c].qunatity+','+csvData[c].work_order+','+csvData[c].location+','+csvData[c].error_message+','+csvData[c].file_name+','+csvData[c].date_created+'\r\n';
                }

                //create file
                var fileObj = file.create({
                    name: 'Kit Conversion Satging Error Record - '+new Date()+'.csv',
                    fileType: file.Type.CSV,
                    contents: csvFile,
                    encoding: file.Encoding.UTF8,
                });

                var ssUrl = '',suiteletUrl = '';
                var accountId = runtime.accountId;
                var envtype = runtime.envType;
                if(accountId == '4901956_SB1' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_kc_staging_failed&amp;whence=';
                    suiteletUrl = 'https://4901956-sb1.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprocess_kit_con&amp;deploy=1&amp;compid=4901956_SB1&amp;whence=';
                }
                if(accountId == '4901956_SB2' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_kc_staging_failed&amp;whence=';
                    suiteletUrl = 'https://4901956-sb2.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprocess_kit_con&amp;deploy=1&amp;compid=4901956_SB2&amp;whence=';
                }
                if(accountId == '4901956' && envtype == 'PRODUCTION'){
                    ssUrl = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_kc_staging_failed&amp;whence=';
                    suiteletUrl = 'https://4901956.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprocess_kit_con&amp;deploy=1&amp;compid=4901956&amp;whence=';
                }

                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>Attached please find failed kit conversion records. Please make the corrections on the kit conversion staging records listed <b><a href="'+ssUrl+'">HERE</a>&nbsp;</b>according to the error messages and reprocess kitting for the corrected record(s) <a href="'+suiteletUrl+'"><b>HERE</b></a>.<br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Failed Kit Conversion Staging Records',
                    attachments: [fileObj]
                });

                log.debug('Email Sent','Ok');
            }
        } catch (error) {
            log.error('Main Exception',error);
        }
    }

    //function to make chunks of array
    function makeArrayDataChunks(dataArray){
        try {
            var  perChunk = 40000 // items per chunk(IN SB 10k,FOR PROD 40k)    

            var inputArray = dataArray//;['a','b','c','d','e']

            var result = inputArray.reduce(function(resultArray, item, index){ 
            var chunkIndex = Math.floor(index/perChunk);

                if(!resultArray[chunkIndex]) {
                    resultArray[chunkIndex] = []; // start a new chunk
                }

                resultArray[chunkIndex].push(item);

                return resultArray;
            }, [])

            // log.debug('chunkresult==',result); // result: [['a','b'], ['c','d'], ['e']]
            return result;
        } catch (error) {
            log.error('Error : In Make Array Data Chunks',error);
            return [];
        }
    }

    return {
        execute: sendKCErrorDetails
    }
});