const functions = require("firebase-functions");
const axios = require('axios').default;
const cheerio = require('cheerio');
const admin = require("firebase-admin");
const twilio = require("twilio");
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone'); // dependent on utc plugin
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
require('dotenv').config();

const isDev = process.argv[2];

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const toNumber = process.env.TWILIO_TO_NUMBER;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const firebaseProjectId = process.env.PROJECT_ID;

const client = twilio(accountSid, authToken);
// const serviceAccount = require("./powderhound-b7c60-firebase-adminsdk-b1aep-b80d2dcdfc.json");

admin.initializeApp({
  ...functions.config().firebase,
  projectId: firebaseProjectId,
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://powderhound-b7c60.us-west3.firebasedatabase.app"
});

const firestore = admin.firestore();

const resortNameToHandleFunction = {
    'alta': handleAlta
};

console.log('Successfully Deployed!');

exports.checkForResortUpdates = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    console.log('This will be run every 5 minutes!');

    await checkForResortUpdates();
});

async function checkForResortUpdates(){
    const resorts = await firestore.collection("resorts").get();
    const now = dayjs().tz("America/Denver");
    // const now = dayjs.tz("2023-03-12 10:30am", "YYYY-MM-DD hh:mma", "America/Denver");
    const todaysDate = now.format('YYYY-MM-DD');

    resorts.docs.forEach(async (documentSnapshot) => {
        const document = documentSnapshot.data();

        console.log(`Checking resort data for ${document.name}`);

        const openingTime = dayjs.tz(`${todaysDate} ${document.opening_time}`, "YYYY-MM-DD hh:mma", document.timezone);
        const closingTime = dayjs.tz(`${todaysDate} ${document.closing_time}`, "YYYY-MM-DD hh:mma", document.timezone);

        console.log(`now          ${now.format()}`);
        console.log(`openingTime  ${openingTime.format()}`);
        console.log(`closingTime  ${closingTime.format()}`);

        if(
            now.isSameOrAfter(openingTime) && 
            now.isSameOrBefore(closingTime)) 
        {
            try {
                const handleFunction = resortNameToHandleFunction[document.name];
                await handleFunction(document);
            } catch (error) {
                console.log(error);
            }
        }
    });

    console.log('done');
};

async function handleAlta(document) {
    console.log('Fetching Alta Data...');
    const altaUrl = "https://www.alta.com/lift-terrain-status";
    const altaResponse = await axios.get(altaUrl);
    console.log('Fetched -> Alta Data.');
    let altaData = altaResponse.data;
    const $ = cheerio.load(altaData);
    let altaDataString = $('script')[0].children[0].data;
    altaDataString = altaDataString.substring(14, altaDataString.length - 1);
    altaData = JSON.parse(altaDataString);
    const lifts = altaData.liftStatus.lifts;

    for(const lift of lifts) {
        const documentLift = document.lifts[lift.name];

        // if(lift.name === 'Supreme') {
        //     lift.open = true; // testing only
        // }

        if(documentLift.is_open !== lift.open) {
            const isOpen = lift.open;

            if(isOpen) {
                console.log('Sending SMS...');

                const messageText = `ALTA - ${lift.name} is now OPEN! Go get those freshies ❄️`;

                try {
                    client.messages.create({
                        to: toNumber,
                        from: fromNumber,
                        body: messageText,
                    })
                    .then(message => console.log(message.sid));
                } catch (error) {
                    console.log(error);
                    console.log(...Object.keys(error));
                }
            }

            document.lifts[lift.name].is_open = isOpen;
            await firestore.collection('resorts').doc('alta').set(document);
        }
    }
}

if(isDev) {
    (async () => {
        checkForResortUpdates();
    })();
}