/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
/*************************************************************
 * File Header
 * Script Type : Schedule Script
 * Script Name : Tonal SCH Email BO SC FE_Failed_Details
 * File Name   : Tonal_SCH_Email_BO_SC_FE_Failed_Details
 * Description : This script is used for send the email for failed BO-staging/SC-staging/FE
 * Created On  : 03/07/2023
 * Modification Details:  
 ************************************************************/
define(["N/search","N/runtime","N/email","N/file"], function(search,runtime,email,file) {

    function sendEmailAlertForFailedData(context) {
        try {
            //get the search id from script parameter
            var scriptObj = runtime.getCurrentScript();
            var searchIdEF = scriptObj.getParameter('custscript_error_fe_data');
            var searchIdSC = scriptObj.getParameter('custscript_error_scs_data');
            var searchIdBO = scriptObj.getParameter('custscript_error_bos_data');
            var emailSender = scriptObj.getParameter('custscript_scbofe_error_email_sender');
            var emailReceiver = scriptObj.getParameter('custscript_scbofe_error_email_receiver');
            if(!searchIdEF || !searchIdSC || !searchIdBO || !emailSender || !emailReceiver){
                log.debug('MISSING_SCRIPT_PARAMETERS',JSON.stringify({search_fe:searchIdEF,search_bo:searchIdBO,search_sc:searchIdSC,email_sender:emailSender,email_receiver:emailReceiver}));
                return;
            }

            var datafe = [],databo = [],datasc = [];
            //far eye data fromation for csv
            if(searchIdEF){
                var searchObjFE =  search.load({
                    id: searchIdEF
                });
                var resultSetFE = searchObjFE.run();
    
                // now take the first portion of data.
                var currentRangeFE = resultSetFE.getRange({
                    start : 0,
                    end : 1000
                });
    
                var isc = 0;  // iterator for all search results
                var jsc = 0;  // iterator for current result range 0..999

                while (jsc < currentRangeFE.length) {
                    // take the result row
                    var result = currentRangeFE[jsc];
                    // and use it like this....
                    var internalId = result.id;
                    datafe.push({
                        internal_id:result.id,
                        bulk_so_line_externalid:result.getValue('externalid'),
                        bulk_so_name:result.getValue({ name: "name", join: "CUSTRECORD_BO_SO_LINE_PARENT",label: "Bulk SO Name"}),
                        sales_orderd:result.getValue({ name: "custrecord_bo_so_sales_order",join: "CUSTRECORD_BO_SO_LINE_PARENT",}),
                        customer_order_number:result.getValue({ name: "custrecord_bo_so_customer_order_no",join: "CUSTRECORD_BO_SO_LINE_PARENT",}),
                        bulk_so_line_name:result.getValue({name: "name",label: "Bulk SO Line Name"}),
                        item:result.getText({name: "custrecord_bo_so_line_item"}),
                        released_qty:result.getValue({name: "custrecord_bo_so_line_released_qty"}),
                        receipt_date:result.getValue({name: "custrecord_bo_so_line_receipt_date"}),
                        delivery_date:result.getValue({name: "custrecord_bo_so_line_delivery_date"}),
                        installation_date:result.getValue({name: "custrecord_bo_so_line_installation_date"}),
                        so_line_error_message:result.getValue({name: "custrecord_bo_so_line_error_msg"})
                    })
                    // finally:
                    isc++; jsc++;
                    if(jsc == 1000 ) {   // check if it reaches 1000
                        jsc = 0;          // reset j an reload the next portion
                        currentRangeFE = resultSetFE.getRange({
                            start : isc,
                            end : isc + 1000
                        });
                    }
                }
            }
            //ship confirmation staging data fromation for csv
            if(searchIdSC){
                var searchObjSC =  search.load({
                    id: searchIdSC
                });
                var resultSetSC = searchObjSC.run();
    
                // now take the first portion of data.
                var currentRangeSC = resultSetSC.getRange({
                    start : 0,
                    end : 1000
                });
    
                var isc = 0;  // iterator for all search results
                var jsc = 0;  // iterator for current result range 0..999

                while (jsc < currentRangeSC.length) {
                    // take the result row
                    var result = currentRangeSC[jsc];
                    // and use it like this....
                    var internalId = result.id;
                    datasc.push({
                        internal_id:result.id,
                        name:result.getValue('name'),
                        status:result.getText({ name: "custrecord_stg_sc_status"}),
                        error_message:result.getValue({ name: "custrecord_stg_sc_error_message"}),
                        date_created:result.getValue({ name: "created"}),
                        processing_date:result.getValue({name: "custrecord_stg_sc_process_date"}),
                    })
                    // finally:
                    isc++; jsc++;
                    if(jsc == 1000 ) {   // check if it reaches 1000
                        jsc = 0;          // reset j an reload the next portion
                        currentRangeSC = resultSetSC.getRange({
                            start : isc,
                            end : isc + 1000
                        });
                    }
                }
            }
            //bulk order staging data fromation for csv
            if(searchIdBO){
                var searchObjBO =  search.load({
                    id: searchIdBO
                });
                var resultSetBO = searchObjBO.run();
    
                // now take the first portion of data.
                var currentRangeBO = resultSetBO.getRange({
                    start : 0,
                    end : 1000
                });
    
                var isc = 0;  // iterator for all search results
                var jsc = 0;  // iterator for current result range 0..999

                while (jsc < currentRangeBO.length) {
                    // take the result row
                    var result = currentRangeBO[jsc];
                    // and use it like this....
                    var internalId = result.id;
                    databo.push({
                        internal_id:result.id,
                        name:result.getValue('name'),
                        status:result.getText({ name: "custrecord_stg_bo_status"}),
                        error_message:result.getValue({ name: "custrecord_stg_bo_error_message"}),
                        date_created:result.getValue({ name: "created"}),
                        processing_date:result.getValue({name: "custrecord_stg_bo_process_date"}),
                    })
                    // finally:
                    isc++; jsc++;
                    if(jsc == 1000 ) {   // check if it reaches 1000
                        jsc = 0;          // reset j an reload the next portion
                        currentRangeBO = resultSetBO.getRange({
                            start : isc,
                            end : isc + 1000
                        });
                    }
                }
            }

            log.debug('datascCount=='+datasc.length,'data=='+JSON.stringify(datasc));
            log.debug('databoCount=='+databo.length,'data=='+JSON.stringify(databo));
            log.debug('datafeCount=='+datafe.length,'data=='+JSON.stringify(datafe));

            if(datafe.length > 0){
                var csvData = datafe;
                //CSV Header
                var csvFile = 'Internal Id,Bulk SO Line ExternalId,Bulk SO Name,Sales Ordererd,Customer Order Number, Bulk SO Name, Item, Released Qty, Receipt Date,Delivery Date,Installation Date,SO Line Error Message\r\n';
                for(var c in csvData){
                    //Add each result as a new line on CSV
                    csvFile += csvData[c].internal_id+','+csvData[c].bulk_so_line_externalid+','+csvData[c].bulk_so_name+','+csvData[c].sales_orderd+','+csvData[c].customer_order_number+','+csvData[c].bulk_so_line_name+','+csvData[c].item+','+csvData[c].released_qty+','+csvData[c].receipt_date+','+csvData[c].delivery_date+','+csvData[c].installation_date+','+JSON.stringify(csvData[c].so_line_error_message)+'\r\n';
                }

                //create file
                var fileObj = file.create({
                    name: 'Bulk SO Lines With Error Loged - '+new Date()+'.csv',
                    fileType: file.Type.CSV,
                    contents: csvFile,
                    encoding: file.Encoding.UTF8,
                });

                var ssUrl = '',suiteletUrl = '';
                var accountId = runtime.accountId;
                var envtype = runtime.envType;
                if(accountId == '4901956_SB1' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_bulk_so_lines_w_error_mes_2&amp;whence=';
                    suiteletUrl = 'https://4901956-sb1.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_create_it_update_bsl&amp;deploy=1&amp;compid=4901956_SB1&amp;whence=';
                }
                if(accountId == '4901956_SB2' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_bulk_so_lines_w_error_mes_2&amp;whence=';
                    suiteletUrl = 'https://4901956-sb2.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_create_it_update_bsl&amp;deploy=1&amp;compid=4901956_SB2&amp;whence=';
                }
                if(accountId == '4901956' && envtype == 'PRODUCTION'){
                    ssUrl = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_bulk_so_lines_w_error_mes_2&amp;whence=';
                    suiteletUrl = 'https://4901956.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_create_it_update_bsl&amp;deploy=1&amp;compid=4901956&amp;whence=';
                }

                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>Attached please find a list of bulk SO lines with error messages logged for Delivery/Receipt/Installation.<br/>';
                htmlString += 'These messages were generated by FarEye or NetSuite. Please review the error messages and take approriate actions to correct the errors.<br/>'; 
                htmlString += 'The list can be access <b><a href="'+ssUrl+'">HERE.</a>&nbsp;</b>Once errors are corrected, please submit Bulk SO Lines for reprocessing <a href="'+suiteletUrl+'"><b>HERE</b></a>.<br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Bulk SO Lines With Error Loged',
                    attachments: [fileObj]
                });

                log.debug('Email Sent For Bulk SO Lines With Error','Ok');

            }
            if(datasc.length > 0){
                var csvData = datasc;
                //CSV Header
                var csvFile = 'Internal Id,Name,Status,Error Message,Date Created, Processing Date\r\n';
                for(var c in csvData){
                    //Add each result as a new line on CSV
                    csvFile += csvData[c].internal_id+','+csvData[c].name+','+csvData[c].status+','+JSON.stringify(csvData[c].error_message)+','+csvData[c].date_created+','+csvData[c].processing_date+'\r\n';
                }

                //create file
                var fileObj = file.create({
                    name: 'Ship Confirmed Staging Failed - '+new Date()+'.csv',
                    fileType: file.Type.CSV,
                    contents: csvFile,
                    encoding: file.Encoding.UTF8,
                });

                var ssUrl = '',suiteletUrl = '';
                var accountId = runtime.accountId;
                var envtype = runtime.envType;
                if(accountId == '4901956_SB1' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_sc_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956-sb1.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_sc&amp;deploy=1&amp;compid=4901956_SB1&amp;whence=';
                }
                if(accountId == '4901956_SB2' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_sc_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956-sb2.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_sc&amp;deploy=1&amp;compid=4901956_SB2&amp;whence=';
                }
                if(accountId == '4901956' && envtype == 'PRODUCTION'){
                    ssUrl = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_sc_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_sc&amp;deploy=1&amp;compid=4901956&amp;whence=';
                }

                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>Attached please find a list of failed Ship Confirmation staging records.<br/>';
                htmlString += 'Please review the error message and make necessary changes to correct the errors.<br/>'; 
                htmlString += 'The list can be accessed <b><a href="'+ssUrl+'">HERE.</a>&nbsp;</b>Once errors are corrected, please submit for reprocessing <a href="'+suiteletUrl+'"><b>HERE</b></a>.<br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Ship Confirmed Staging Failed',
                    attachments: [fileObj]
                });

                log.debug('Email Sent For Ship Confirmed Staging Failed','Ok');
            }
            if(databo.length > 0){
                var csvData = databo;
                //CSV Header
                var csvFile = 'Internal Id,Name,Status,Error Message,Date Created, Processing Date\r\n';
                for(var c in csvData){
                    //Add each result as a new line on CSV
                    csvFile += csvData[c].internal_id+','+csvData[c].name+','+csvData[c].status+','+JSON.stringify(csvData[c].error_message)+','+csvData[c].date_created+','+csvData[c].processing_date+'\r\n';
                }

                //create file
                var fileObj = file.create({
                    name: 'Bulk Order Staging Failed - '+new Date()+'.csv',
                    fileType: file.Type.CSV,
                    contents: csvFile,
                    encoding: file.Encoding.UTF8,
                });

                var ssUrl = '',suiteletUrl = '';
                var accountId = runtime.accountId;
                var envtype = runtime.envType;
                if(accountId == '4901956_SB1' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_bo_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956-sb1.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_bo&amp;deploy=1&amp;compid=4901956_SB1&amp;whence=';
                }
                if(accountId == '4901956_SB2' && envtype == 'SANDBOX'){
                    ssUrl = 'https://4901956-sb2.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_bo_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956-sb2.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_bo&amp;deploy=1&amp;compid=4901956_SB2&amp;whence=';
                }
                if(accountId == '4901956' && envtype == 'PRODUCTION'){
                    ssUrl = 'https://4901956.app.netsuite.com/app/common/search/searchresults.nl?searchid=customsearch_failed_bo_staging_records&amp;whence=';
                    suiteletUrl = 'https://4901956.app.netsuite.com/app/site/hosting/scriptlet.nl?script=customscript_tnl_sl_reprcess_bo&amp;deploy=1&amp;compid=4901956&amp;whence=';
                }

                //send email with the attachement
                var htmlString = '';
                htmlString += 'Hi Team,<br/>';
                htmlString += '<br>Attached please find a list of failed Bulk Order staging records.<br/>';
                htmlString += 'Please review the error message and make necessary changes to correct the errors.<br/>'; 
                htmlString += 'The list can be accessed <b><a href="'+ssUrl+'">HERE.</a>&nbsp;</b>Once errors are corrected, please submit for reprocessing <a href="'+suiteletUrl+'"><b>HERE</b></a>.<br/>';
                htmlString += '<br>Thanks,';
                htmlString += '<br>-NetSuite Alert';

                email.send({
                    author: emailSender,
                    body: htmlString,
                    recipients: emailReceiver,
                    subject: 'Bulk Order Staging Failed',
                    attachments: [fileObj]
                });

                log.debug('Email Sent For Bulk Order Staging Failed','Ok');
            }

        } catch (error) {
            log.error('Main Exception',error);
        }
    }

    return {
        execute: sendEmailAlertForFailedData
    }
});
