/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */

define(['N/search', 'N/record'], function (search, record) {
  function execute(context) {
    const stagingRecords = []
    search
      .create({
        type: 'customrecord_accessory_staging',
        filters: null,
        columns: [
          { name: 'internalid' },
          { name: 'custrecord_stg_lines' },
        ],
      })
      .run()
      .each((result) => {
        var temp = result.getValue({ name: 'custrecord_stg_lines' })
        if (typeof temp === 'string') {
          temp = JSON.parse(temp)
          if (temp.length > 1) {
            stagingRecords.push({
              id: result.getValue({ name: 'internalid' }),
              lines: temp,
            })
          }
        }
        return true
      })

    log.debug('Number of staging records', stagingRecords.length)
    log.debug('staging records', stagingRecords)
  }

  return {
    execute: execute,
  }
})
