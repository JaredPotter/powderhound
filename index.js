const axios = require('axios').default;
const cheerio = require('cheerio');

(async () => {
    const altaUrl = "https://www.alta.com/lift-terrain-status";
    const altaResponse = await axios.get(altaUrl);
    let altaData = altaResponse.data;
    const $ = cheerio.load(altaData);
    let altaDataString = $('script')[0].children[0].data;
    altaDataString = altaDataString.substring(14, altaDataString.length - 1);
    altaData = JSON.parse(altaDataString);
    const liftStatus = altaData.liftStatus;
    // const
    // const scriptTag = 
    debugger;
})()