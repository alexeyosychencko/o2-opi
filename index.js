import got from "got";

// let turnCompsOnDate = ;
// let turnCompsOffDate = ;
// compressor id = 5
// ozonator id 6
// ionizator id 7

async function run() {
    console.log("run");
    const state = await getStateFromRegisters();

    const modifyRegs = calcModifications(state);

    // write to regs
    changeRegs(modifyRegs);
}

setInterval(run, 5000);

// read regs --------------------------------------------------------------

async function getStateFromRegisters() {
    const regs = await readRegisters();
    console.log(regs);
    // {
    //     [deviceId]: {
    //         [address]: ""
    //     }
    // }
    // { comps: {}, ozon: {}, ionz: {} }
    return composeState(regs);
}

async function readRegisters() {
    const result = {};
    // sensor value
    result[1] = { 0: (await readRegProccess(1, 0, 1))[0] * 0.1 };
    // compressor relay state
    result[5] = { 2.3: (await readRegProccess(5, 2.3, 1)) };
    // ozonator relay state
    result[6] = { 2.3: (await readRegProccess(6, 2.3, 1)) };
    // ionyzer relay state
    result[7] = { 2.3: (await readRegProccess(7, 2.3, 1)) };
    // sensor settings
    result[111] = {};
    const sensorSettings = await readRegProccess(111, 5500, 6);
    result[111][5500] = sensorSettings;
    const ozonEvents = await readRegProccess(111, 5520, 90);
    result[111][5520] = ozonEvents;
    const ionzEvents = await readRegProccess(111, 5720, 90);
    result[111][5720] = ionzEvents;
    return result;
}

function composeState(regs) {
    return {
        comps: {
            relay: regs[5][2.3],
            sensorValue: regs[1][0] + regs[111][5500][0],
            setting: regs[111][5500][1],
            topLimit: regs[111][5500][1] + regs[111][5500][2],
            lowLimit: regs[111][5500][1] + regs[111][5500][4],
            delayOn: regs[111][5500][3],
            delayOff: regs[111][5500][5],
        },
        ozon: {
            events: composeEvents(regs[111][5520]),
        },
        ionz: {
            events: composeEvents(regs[111][5720]),
        }
    };
}

function composeEvents(values) {
    const events = [];
    for (let i = 0; i < values.length; i += 3) {
        if (values[i] === 0 && values[i + 1] === 0 && values[i + 2] === 0) {
            return events;
        }
        events.push({
            day: values[i],
            timeStartMin: values[i + 1],
            durationS: values[i + 2],
        });
    }
}

// calc mods --------------------------------------------------------------

function calcModifications(state) {
    const mods = {};
    mods.comps = calcCompsMods(state.comps);
    mods.ozon = calcOzonMods(state.ozon);
    mods.ionz = calcIonzMods(state.ionz);
    return mods;
}
// ozon
function calcOzonMods() {
    const currentDay = new Date().getDay();
    const currentDayTime = new Date().getSeconds();
}

// make tcp requests ---------------------------------------------------------------

async function readRegProccess(deviceId, address, quantity) {
    const readReq = makeReadRequest(deviceId, address, quantity);
    const tcpRes = await reuestToApi(readReq, deviceId);
    return parseTCPResponse(tcpRes, quantity);
}

function makeReadRequest(deviceId, address, quantity) {
    const data = [deviceId, Number("0x03"), ...numberToHiLowBytes(address), ...numberToHiLowBytes(quantity)];
    if (deviceId === 111) {
        return formatTcpRequest(
            data,
            0,
        );
    }
    return formatRtuRequest(data);
}

async function reuestToApi(request, address) {
    const data = {
        request: request,
        type: address === 111 ? "1" : "0",
        dst: address === 111 ? "self" : "ttyUSB0",
    };
    const result = (await got("http://127.0.0.1:8502/api/mbgate.json", {
        method: "post",
        responseType: "text",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(data).toString(),
    })).body;
    return JSON.parse(result).response;
}

function formatTcpRequest(data, lastTransId) {
    const tid = numberToHiLowBytes(lastTransId);
    const pid = numberToHiLowBytes(0);
    data.unshift(...numberToHiLowBytes(data.length));
    data.unshift(...pid);
    data.unshift(...tid);
    return data.map(numberToHex8).join("");
}

function formatRtuRequest(data) {
    const res = `${data.map(numberToHex8).join("")}`;
    return res;
}

function numberToHiLowBytes(value) {
    return [(value >> 8) & 0xff, value & 0xff];
}

function numberToHex8(value) {
    return value.toString(16).padStart(2, "0");
}

function parseTCPResponse(response, quantity) {
    const valuesRes = response.slice(-quantity * 4);

    const result = [];
    for (let i = 0; i < valuesRes.length; i += 4) {
        const hexNumber = `${valuesRes[i]}${valuesRes[i + 1]}${valuesRes[i + 2]}${valuesRes[i + 3]
            }`;
        result.push(parseInt(hexNumber, 16));
    }
    return result;
}