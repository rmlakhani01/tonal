/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
 * File Header
 * Script Type : Map Reduce
 * Script Name : Tonal MR SFE JE For Revenue Recognize
 * File Name   : Tonal_MR_SFE_JE_For_Revenue_Recognize.js
 * Description : This script is used for create JE for SFE/TF orders for revenue recognize. This script will run monthly once.
 * Date: 09/25/2024
 * ************************************************************/
/**
 * Update History
 * Version                  By                  Date                Requested By                        Description
 * 
 */
//step 1 : get the input from the saved search,account
//step 2 : create one JE for all sales order and tagaed respective so,customer,account,amount for JE lines
//step 3 : update parent/child JE refrence and custom fields if any on SO
let runtime,search,record;
define(["N/runtime","N/search","N/record"], main);
function main(runtimeModule,searchModule,recordModule) {

    runtime = runtimeModule;
    search = searchModule;
    record = recordModule;

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }
}

const getInputData = () => {
    try {
        //get the search details,amount,account for JE creation
        let scriptObj = runtime.getCurrentScript();
        let ssId = scriptObj.getParameter('custscript_sfe_revrec_je_data');//saved search
        let rrDebitAccount = scriptObj.getParameter('custscript_sfe_revrec_da');//debit account
        let rrCreditAccount = scriptObj.getParameter('custscript_sfe_revrec_ca');//credit account
        if(!ssId || !rrCreditAccount || !rrDebitAccount){
            log.debug('NO_ACTION_PARAMS_MISSING',JSON.stringify({ssId:ssId,bsDebitAccount:rrDebitAccount,bsCreditAccount:rrCreditAccount}));
            return [];
        }

        //get current date , and derive current year and month
        let currentYearMonth = getCurrentMonthAndYear(new Date());
        log.debug('currentYearMonth==',currentYearMonth);

        let data = getDataForRevRecJe(ssId,currentYearMonth,rrDebitAccount,rrCreditAccount);
        return data;
    } catch (error) {
        log.error('Error : In Get Input Stage',error);
        return [];
    }    
}

const map = (context) => {
    let key,jeData;
    try {
        // log.debug('mapContext==',context);
        key = context.key;
        jeData = JSON.parse(context.value);
        let jeLines = jeData.journalLines;
        //create JE
        let jeObj = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true
        });

        //set subsidiary
        jeObj.setValue('subsidiary',jeData.subsidiary);

        //set externalid
        //jeObj.setValue('externalid','');

        //set status approved
        jeObj.setValue('approvalstatus', 2);

        //set date
        jeObj.setValue('trandate',new Date(jeData.date));

        //set memo header
        jeObj.setValue('memo',jeData.memo);

        //loop over je lines and set the je line details
        let soIds = []
        for(let j in jeLines){
            if(jeLines[j].credit){
                setLines('credit',jeObj,jeLines[j]);
                let index = soIds.findIndex(function(e){return e == jeLines[j].credit.saleOrder})
                if(index == -1){
                    soIds.push(jeLines[j].credit.saleOrder);
                }
            }
            if(jeLines[j].debit){
                setLines('debit',jeObj,jeLines[j]);
                let index = soIds.findIndex(function(e){return e == jeLines[j].debit.saleOrder})
                if(index == -1){
                    soIds.push(jeLines[j].debit.saleOrder);
                }
            }
        }

        let jeId = jeObj.save();
        if(jeId){
            log.debug('JE CREATED SUCCESSFULLY!!',jeId);
            log.debug('soIds=='+soIds.length,soIds);
            for(let s in soIds){
                context.write({key:soIds[s],value:{data:jeData,status:'success',jeId:jeId,salesOrder:soIds[s]}});
            }
        }
    } catch (error) {
        log.error('Error : In Map Stage',error);
        context.write({key:key,value:{data:jeData,status:'fail',error:error.message}});
    }
}

const reduce = (context) => {
    let data;
    try {
        // log.debug('reduceContext==',context);
        //update back SO with any custom fields oj JE tagged
        let key = context.key;
        data = JSON.parse(context.values[0]);
        let soId = data.salesOrder;
        let status = data.status;
        let jeId = data.jeId;
        //success
        if(status == 'success'){
            //update SO with JE details or other fields
            //close sales order, or update nay field values
            let soClosed = closeChildSalesOrder(soId,jeId);
            if(soClosed == true){
                context.write({key:key,value:{data:data,status:'success',jeId:jeId,salesOrder:soId}});
            }
            else{
                context.write({key:key,value:{data:data,status:'fail',jeId:jeId,salesOrder:soId,error:soClosed.error}});
            }
        }
        else{
            context.write({key:key,value:{data:data,status:'fail'}});
        }
    } catch (error) {
        log.error('Error : In Reduce Stage',error);
        context.write({key:key,value:{data:data,status:'fail',error:error.message}});
    }
}

const summarize = (summary) => {
    try {
        let successData = [],failData = [];
        summary.output.iterator().each(function (key, value) {
            /* log.debug({
                title: 'SFE/TF',
                details: 'key: ' + key + ' / value: ' + value
            }); */

            const data = JSON.parse(value);

            if (data.status == 'success') {
                successData.push(data);
            }
            if (data.status == 'fail') {
                failData.push(data);
            }
            return true;
        });
        log.debug('successData=='+successData.length,successData);
        log.debug('failData=='+failData.length,failData);
    } catch (error) {
        log.error('Error : In Summarize',error);
    }
}

const setLines = (type,jeObj,jeLines) => {
    if(type == 'debit'){
        jeObj.selectNewLine({
            sublistId: 'line'
        });
    
        //debit account
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: jeLines.debit.debitAccount
        });
    
        //debit amount
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: jeLines.debit.debitAmount
        });
    
        //debit memo
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: jeLines.debit.memoLine
        });
    
        //debit name
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: jeLines.debit.entity
        });
    
        //debit sales order
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sales_order_refrence',
            value: jeLines.debit.saleOrder
        });

        jeObj.commitLine({
            sublistId: 'line'
        });
    }
    else{
        jeObj.selectNewLine({
            sublistId: 'line'
        });
    
        //credit account
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: jeLines.credit.creditAccount
        });
    
        //credit amount
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: jeLines.credit.creditAmount
        });
    
        //credit memo
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: jeLines.credit.memoLine
        });
    
        //credit name
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: jeLines.credit.entity
        });
    
        //credit sales order
        jeObj.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_sales_order_refrence',
            value: jeLines.credit.saleOrder
        });

        jeObj.commitLine({
            sublistId: 'line'
        });
    }
}

//funnction to get the current year and month
const getCurrentMonthAndYear = (dateObj) =>{
    let monthsName = ['January','February','March','April','May','June','July',
        'August','September','October','November','December'
    ];
    let c_year = dateObj.getFullYear();
    let c_month = dateObj.getMonth();
    return monthsName[c_month]+' '+c_year;
}

//function to form the data for the Rev Rec JE
const getDataForRevRecJe = (ssId,currentYearMonth,rrDebitAccount,rrCreditAccount) => {
    try {
        //load the search data and form the data for JE creation and line add on JE
        let searchObj = search.load({
            id: ssId
        });
        let resultSet = searchObj.run();
        // now take the first portion of data.
        let currentRange = resultSet.getRange({
            start : 0,
            end : 1000
        });

        let i = 0;  // iterator for all search results
        let j = 0;  // iterator for current result range 0..999

        let data = [{
            memo:'Rev Rec '+currentYearMonth,
            date:new Date(),
            subsidiary:1,
            journalLines:[]
        }];

        let journalLineData = [];

        while (j < currentRange.length) {
            // take the result row
            let result = currentRange[j];
            // and use it like this....
            let objLine = {
                credit:{
                    saleOrder:result.id,
                    creditAmount:Number(result.getValue('custcoll_sfe_revenue_amount')),
                    creditAccount:Number(rrCreditAccount),
                    memoLine:result.getValue('otherrefnum')?'REV_REC_'+result.getValue('otherrefnum'):'',
                    entity:result.getValue('entity')
                },
                debit:{
                    saleOrder:result.id,
                    debitAmount:Number(result.getValue('custcoll_sfe_revenue_amount')),
                    debitAccount:Number(rrDebitAccount),
                    memoLine:result.getValue('otherrefnum')?'REV_REC_'+result.getValue('otherrefnum'):'',
                    entity:result.getValue('entity')
                }
            }
            // data[0].journalLines.push(objLine);
            journalLineData.push(objLine);

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

        log.debug('journalLineData=='+journalLineData.length,journalLineData);

        if(journalLineData.length == 0){
            return [];
        }

        data[0].journalLines = journalLineData;
        log.debug('data=='+data.length,data);
        return data;
    } catch (error) {
        log.error('Error : In Get Date For Rev Rec JE',error);
        return [];
    }
}

//function to close teh child sales order if required update some field value
const closeChildSalesOrder = (soId,jeId) =>{
    try {
        let soObj = record.load({
            type: record.Type.SALES_ORDER,
            id: soId,
            isDynamic: true
        });

        let soLines = soObj.getLineCount('item');

        //llop over the line and make isclose flag true for all the lines
        for(let l = 0 ; l < soLines ; l ++){
            soObj.selectLine('item',l);
            soObj.setCurrentSublistValue('item','isclosed',true);
            soObj.commitLine('item');
        }
        let soIds = soObj.save();
        if(soIds){
            log.debug('SALES ORDER CLOSED SUCCSESSFULLY!!',soIds);
            return true;
        }
    } catch (error) {
        log.error('Error : In Close Child Sales Order',error);
        return {
            error:error.message,
            status:false
        }
    }
}