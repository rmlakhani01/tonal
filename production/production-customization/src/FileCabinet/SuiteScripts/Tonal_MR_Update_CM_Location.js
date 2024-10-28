/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
/*************************************************************
* File Header
* Script Type: Map Reduce
* Script Name: Tonal MR Update CM Location
* File Name  :Tonal_MR_Update_CM_Location.js
* Created On : 03/12/2024
* Modified On: 
* Created By : 
* Modified By: 
* Description: This is used for update location on CM
************************************************************/
let runtime,search,record;
define(["N/runtime","N/search","N/record"], main);
function main(runtimeModule,searchModule,recordModule) {

    try {

        runtime = runtimeModule;
        search = searchModule;
        record = recordModule;

        return {
            getInputData: getInputData,
            map: map
        }
    } catch (error) {
        log.error('Main Exception',error);
    }
}

const getInputData = () => {
    try {
        let scriptObj = runtime.getCurrentScript();
        let locationCM = scriptObj.getParameter('custscript_cm_location');
        let ssId = scriptObj.getParameter('custscript_cm_data_loc_updated');
        log.debug('locationCM=='+locationCM,'ssId=='+ssId);
        if(!locationCM || !ssId){
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
        log.debug('mapContext==',context);
        let data = JSON.parse(context.value);
        let cmId = context.key;
        let scriptObj = runtime.getCurrentScript();
        let locationCM = scriptObj.getParameter('custscript_cm_location');
        //update the cm with the required location
        let id = record.submitFields({
            type: record.Type.CREDIT_MEMO,
            id: cmId,
            values: {
                location:locationCM
            }  
        });
        if(id){
            log.debug('Location Updated On CM!!',id);
        }
       
    } catch (error) {
        log.error('Error : In Map',error);
    }
}