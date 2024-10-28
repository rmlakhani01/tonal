/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR Accural Je
* File Name  : Tonal_MR_Accural_Je.js
* Created On : 02/29/2023
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for create JE for CD,CR agianst DEPOSITE
************************************************************/
let search,runtime,record;
define(["N/search","N/runtime","N/record"], main);
function main(searchModule,runtimeModule,recordModule) {
    try {

        search = searchModule;
        runtime = runtimeModule;
        record = recordModule;    

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            // summarize: summarize
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let STRIPE_DEBIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_da');//943
        let STRIPE_CREDIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_ca');//1020
        let STRIPE_REFUND_DEBIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_rda');//1020
        let STRIPE_REFUND_CREDIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_rca');//252
        let ssId = scriptObj.getParameter('custscript_data_deposite');
        if(!STRIPE_DEBIT_ACCOUNT || !STRIPE_CREDIT_ACCOUNT || !STRIPE_REFUND_DEBIT_ACCOUNT || !STRIPE_REFUND_CREDIT_ACCOUNT){
            log.debug('NO_ACTION','MISSING_PARAMETERS=='+JSON.stringify({STRIPE_DEBIT_ACCOUNT:STRIPE_DEBIT_ACCOUNT,STRIPE_CREDIT_ACCOUNT:STRIPE_CREDIT_ACCOUNT,STRIPE_REFUND_DEBIT_ACCOUNT:STRIPE_REFUND_DEBIT_ACCOUNT,STRIPE_REFUND_CREDIT_ACCOUNT:STRIPE_REFUND_CREDIT_ACCOUNT,ssId:ssId}));
            return [];
        }

        return search.load({
            id: ssId
        });
    } catch (error) {
        log.error('Error : In Get Input',error);
        return [];
    }
}

const map = (context) => {
    try {
        // log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        let depositeId = data.values['GROUP(internalid)'].value;
        let depositeNumber = data.values['GROUP(tranid)'];
        log.debug('Processing For Deposite '+depositeNumber,depositeId);

        let depositRecord = record.load({
            type: record.Type.DEPOSIT,
            id: depositeId,
            isDynamic: true,
            defaultValues: Object
        });

        let tranDate = depositRecord.getValue('trandate');

        const payments = extractPaymentDetails(depositRecord);
        log.debug('payments', payments);
        
        const transactionTypes = paymentTypes(payments);
        const paymentTotals = computePaymentTotals(payments,transactionTypes);

        const cashBackPayments = extractCashBackDetails(depositRecord);
        const cashBackTotals = computeCashbackTotals(cashBackPayments);
        log.debug('cashBackTotals==',cashBackTotals);

        let customerDeposits = paymentTotals.filter((payment) => payment.type === 'CustDep');

        let customerRefunds = paymentTotals.filter((payment) => payment.type === 'CustRfnd');

        log.debug('customerDeposits=='+customerDeposits.length,customerDeposits);
        log.debug('customerRefunds=='+customerRefunds.length,customerRefunds);

        if (customerRefunds && customerRefunds.length > 0) {
            const custRefunds = customerRefunds[0].details;
            /* const orderIdRegex = /\d{10}/; */
            let hardwareOrders = custRefunds;/* custRefunds.filter((refund) =>orderIdRegex.test(refund.memo)); */
            
            hardwareOrders.forEach((refund) => {
                //check if je1 field is emptey then only write for je creation
                let crje1 = search.lookupFields({
                    type: search.Type.CUSTOMER_REFUND,
                    id: refund.id,
                    columns: ['custbody_merchant_fee_je_1']
                });
                // log.debug('crje1=='+refund.id,crje1);
                if(crje1.custbody_merchant_fee_je_1.length > 0 && !crje1.custbody_merchant_fee_je_1[0].value){
                    log.debug('Writting CR Data For JE Creation=='+refund.id,crje1);
                    context.write({key:refund.id,value:{data:refund,depositeId:depositeId,tranDate:tranDate}});
                }
            })
          }
    
          if (customerDeposits && customerDeposits.length > 0) {
            const deposits = customerDeposits[0].details
            deposits.forEach((deposit) => {
                //check if je1 field is emptey then only write for je creation
                let cdje1 = search.lookupFields({
                    type: search.Type.CUSTOMER_DEPOSIT,
                    id: deposit.id,
                    columns: ['custbody_merchant_fee_je_1']
                });
                // log.debug('cdje1=='+deposit.id,cdje1);
                if (deposit.paymentMethod === '11' && cdje1.custbody_merchant_fee_je_1.length > 0 && !cdje1.custbody_merchant_fee_je_1[0].value) {
                    log.debug('Writting CD Data For JE Creation=='+deposit.id,cdje1);
                    context.write({key:deposit.id,value:{data:deposit,depositeId:depositeId,tranDate:tranDate}});
                }
            })
          }
    } catch (error) {
        log.error('Error : In Map Stage',error);
    }
}

const reduce = (context) => {
    try {
        log.debug('reduceContext==',context);
        let scriptObj = runtime.getCurrentScript();
        let STRIPE_DEBIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_da');//943
        let STRIPE_CREDIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_ca');//1020
        let STRIPE_REFUND_DEBIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_rda');//1020
        let STRIPE_REFUND_CREDIT_ACCOUNT = scriptObj.getParameter('custscript_stripe_rca');//252
        let datas = JSON.parse(context.values[0]);
        let values = datas.data;
        let recType = values.type;
        let id = context.key;
        let tranDate = new Date(datas.tranDate);
        if(recType == 'CustDep'){
            log.debug('Creating JE For CUSTOMER DEPOSITE',id);
            generateStripeJE(values,record.Type.CUSTOMER_DEPOSIT,tranDate,values.memo,STRIPE_DEBIT_ACCOUNT,STRIPE_CREDIT_ACCOUNT);
        }
        if(recType == 'CustRfnd'){
            log.debug('Creating JE For CUSTOMER REFUND',id);
            generateStripeJE(values,record.Type.CUSTOMER_REFUND,tranDate,values.memo,STRIPE_REFUND_DEBIT_ACCOUNT,STRIPE_REFUND_CREDIT_ACCOUNT);
        }
    } catch (error) {
        log.error('Error : In Reduce Stage',error);
    }
}

const summarize = (summary) => {
    try {
        
    } catch (error) {
        log.error('Error : In Summarize Stage',error);
    }
}

const extractPaymentDetails = (depositRecord) => {
    try {
        log.debug('depositRecord', depositRecord)
        const payments = []

        const depositRec = depositRecord;

        let lineCount = depositRec.getLineCount({
        sublistId: 'payment',
        });

        for (var i = 0; i < lineCount; i += 1) {
            let isApplied = depositRec.getSublistValue({
                sublistId: 'payment',
                fieldId: 'deposit',
                line: i,
            });

            if (isApplied === true) {
                let payment = {
                line: i,
                type: depositRec.getSublistValue({
                    sublistId: 'payment',
                    fieldId: 'type',
                    line: i,
                }),
                amount: parseFloat(
                    depositRec.getSublistValue({
                    sublistId: 'payment',
                    fieldId: 'paymentamount',
                    line: i,
                    }),
                ),
                id: depositRec.getSublistValue({
                    sublistId: 'payment',
                    fieldId: 'id',
                    line: i,
                }),
                memo: depositRec.getSublistValue({
                    sublistId: 'payment',
                    fieldId: 'memo',
                    line: i,
                }),
                paymentMethod: depositRec.getSublistValue({
                    sublistId: 'payment',
                    fieldId: 'paymentmethod',
                    line: i,
                }),
                }
                payments.push(payment)
            }
        }
        return payments
    } catch (error) {
        log.debug('ERROR IN EXTRACT PAYMENT DETAILS', error);
        return [];
    }
}

const extractCashBackDetails = (depositRecord) => {
    try {
        const payments = []

        const depositRec = depositRecord;

        const lineCount = depositRec.getLineCount({
        sublistId: 'cashback',
        })
        for (let i = 0; i < lineCount; i++) {
            payments.push({
                line: depositRec.getSublistValue({
                sublistId: 'cashback',
                fieldId: 'line',
                line: i,
                }),
                amount: depositRec.getSublistValue({
                sublistId: 'cashback',
                fieldId: 'amount',
                line: i,
                }),
            });
        }
        return payments
    } catch (error) {
        log.error('ERROR : IN EXTRACT CASH BACK DETAILS',error);
        return [];
    }
}

const paymentTypes = (payments) => {
    const transactionTypes = []

    // grabbing unique payments types
    const types = new Set()
    for (const payment of payments) {
        types.add(payment.type)
    }

    // extracting payment types
    types.forEach((type) => transactionTypes.push(type))

    return transactionTypes
}

const computePaymentTotals = (payments, transactionTypes) => {
    const STRIPE_FEE_PERCENTAGE = parseFloat(runtime.getCurrentScript().getParameter({ name: 'custscript_stripe_percentages' }));
    const amounts = []
    for (var i = 0; i < transactionTypes.length; i++) {
            amounts.push({
            type: transactionTypes[i],
            numberOfRecords: payments.filter(
                (deposits) => deposits.type === transactionTypes[i],
            ).length,
            amount: payments
                .filter((deposits) => deposits.type === transactionTypes[i])
                .reduce((acc, deposit) => acc + deposit.amount, 0),
            details: payments.filter(
                (deposits) => deposits.type === transactionTypes[i],
            ),
            feeAmount: calculateStripeFee(
                payments,
                STRIPE_FEE_PERCENTAGE,
            ),
        });
    }

    return amounts
}

const calculateStripeFee = (payments, stripePercentage) => {
    for (var value of payments) {
        value.fee = value.amount * stripePercentage
    }
    log.debug('calculateStripeFee payments', payments)
}

const computeCashbackTotals = (cashBackPayments) => {
    return cashBackPayments.reduce((acc, cashback) => acc + cashback.amount,0)
}

const generateStripeJE = (object,type,tranDate,memo,debitAccount,creditAccount) => {
    let journalRecord = record.create({
        type: record.Type.JOURNAL_ENTRY,
        isDynamic: true,
    })

    journalRecord.setValue({
        fieldId: 'trandate',
        value: tranDate,
    })

    journalRecord.setValue({ fieldId: 'approvalstatus', value: 2 })
    journalRecord.setValue({ fieldId: 'subsidiary', value: 1 })
    journalRecord.setValue({ fieldId: 'memo', value: memo })
    journalRecord.insertLine({ sublistId: 'line', line: 0 })
    journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: debitAccount,
    })
    journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        value: object.fee,
    })
    journalRecord.commitLine({ sublistId: 'line' })
    journalRecord.insertLine({ sublistId: 'line', line: 1 })
    journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: creditAccount,
    })
    journalRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        value: object.fee,
    })
    journalRecord.commitLine({ sublistId: 'line' })

    let journalId = journalRecord.save()
    if (journalId && type === record.Type.CUSTOMER_DEPOSIT){
        log.debug('JE Created For CUSTOMER DEPOSITE=='+object.id,'JE Id=='+journalId);
        updateCustomerDeposit(journalId, object.id, object.fee)
    }
        
    if (journalId && type === record.Type.CUSTOMER_REFUND){
        log.debug('JE Created For CUSTOMER REFUND=='+object.id,'JE Id=='+journalId);
        updateCustomerRefund(journalId, object.id)
    }
       
}

const updateCustomerDeposit = (journalId, depositId, fee) => {
    let customerDeposit = record.load({
        type: record.Type.CUSTOMER_DEPOSIT,
        id: depositId,
    })
    customerDeposit.setValue({
        fieldId: 'custbody_payment_fee',
        value: fee,
    })
    customerDeposit.setValue({
        fieldId: 'custbody_merchant_fee_je_1',
        value: journalId,
    })
    customerDeposit.save()
    log.debug(
        'Customer Deposit ID: ' + depositId,
        'Has been updated with the first Journal Entry',
    )
}

const updateCustomerRefund = (journalId, refundId) => {
    let refund = record.load({
        type: record.Type.CUSTOMER_REFUND,
        id: refundId,
    })
    refund.setValue({
        fieldId: 'custbody_merchant_fee_je_1',
        value: journalId,
    })
    refund.save()
    log.debug(
        'Customer Refund ID: ' + refundId,
        'Has been updated with the first Journal Entry',
    )
}