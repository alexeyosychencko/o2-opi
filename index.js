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
    const sensorVal = (await readRegProccess(1, 0, 1)) * 0.1;
    console.log(sensorVal);
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
    const tcpReq = makeReadTCPRequest(deviceId, address, quantity);
    const tcpRes = await reuestToApi(tcpReq);
    return parseTCPResponse(tcpRes, quantity);
}

function makeReadTCPRequest(deviceId, address, quantity) {
    return formatTcpRequest(
        [deviceId, Number("0x03"), ...numberToHiLowBytes(address), ...numberToHiLowBytes(quantity)],
        0,
    ).replace(/:/g, "");
}

async function reuestToApi(tcpReq) {
    const result = (await got.post("/api/mbgate.json", {
        request: tcpReq,
        type: "1",
        dst: "self",
    }).text()).response;
    return result;
}

function formatTcpRequest(data, lastTransId) {
    const tid = numberToHiLowBytes(lastTransId);
    const pid = numberToHiLowBytes(0);
    data.unshift(...numberToHiLowBytes(data.length));
    data.unshift(...pid);
    data.unshift(...tid);
    return data.map(numberToHex8).join(":");
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