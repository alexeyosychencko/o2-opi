import got from "got";

let turnCompsOnDate;
let turnCompsOffDate;

// compressorId 5
// ozonatorId 6
// ionizatorId 7

async function run() {
    console.log("run");
    const state = await getStateFromRegisters();
    // console.log(state);
    const modifyRegs = calcModifications(state);
    console.log(modifyRegs);
    // write to regs
    await changeRegs(modifyRegs);
}

setInterval(run, 5000);

// read regs --------------------------------------------------------------

async function getStateFromRegisters() {
    const regs = await readRegisters();
    return composeState(regs);
}

async function readRegisters() {
    const result = {};
    // sensor value
    result[1] = { 0: (await readRegProccess(1, 0, 1))[0] * 0.1 };
    // compressor relay state
    result[5] = { 2.3: (await readRegProccess(5, 2.3, 1))[0] };
    // ozonator relay state
    result[6] = { 2.3: (await readRegProccess(6, 2.3, 1))[0] };
    // ionyzer relay state
    result[7] = { 2.3: (await readRegProccess(7, 2.3, 1))[0] };
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
            lowLimit: regs[111][5500][1] - regs[111][5500][4],
            delayOn: regs[111][5500][3],
            delayOff: regs[111][5500][5],
        },
        ozon: {
            events: composeEvents(regs[111][5520]),
            relay: regs[6][2.3],
        },
        ionz: {
            events: composeEvents(regs[111][5720]),
            relay: regs[7][2.3],
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
            durationMin: values[i + 2],
        });
    }
}

// calc mods ---------------------------------------------------------------------

function calcModifications(state) {
    const mods = {};
    mods.comps = calcCompsMods(state.comps);
    mods.ozon = calcOzonMods(state.ozon);
    mods.ionz = calcIonzMods(state.ionz);
    return mods;
}

function calcCompsMods(state) {
    let turnRelayOn = false;
    if (state.sensorValue <= state.lowLimit) {
        turnRelayOn = true;
        turnCompsOffDate = undefined;
    } else if (state.sensorValue >= state.topLimit) {
        turnRelayOn = false;
        turnCompsOnDate = undefined;
    } else {
        turnCompsOnDate = undefined;
        turnCompsOffDate = undefined;
        return {};
    }

    if (turnRelayOn) {
        if (state.relay) {
            turnCompsOnDate = undefined;
            return {};
        }
        if (!turnCompsOnDate) {
            turnCompsOnDate = new Date(new Date().setSeconds(new Date().getSeconds() + state.delayOn * 60));
            return {};
        }
        if (turnCompsOnDate > new Date()) {
            return {};
        }
        return {
            5: {
                50: 14262
            }
        };
    }

    if (!turnRelayOn) {
        if (!state.relay) {
            turnCompsOffDate = undefined;
            return {};
        }
        if (!turnCompsOffDate) {
            turnCompsOffDate = new Date(new Date().setSeconds(new Date().getSeconds() + state.delayOff * 60));
            return {};
        }
        if (turnCompsOffDate > new Date()) {
            return {};
        }
        return {
            5: {
                50: 14263
            }
        };

    }

    return {};
}

// ozon
function calcOzonMods(state) {
    const currentDay = new Date().getDay();
    const currentDayMin = new Date().getMinutes() + (new Date().getHours() * 60);

    let turnRelayOn = false;
    for (const event of state.events) {
        if (currentDay === event.day && currentDayMin >= event.timeStartMin && currentDayMin <= event.timeStartMin + event.durationMin) {
            turnRelayOn = true;
        }
    }

    if (turnRelayOn) {
        if (state.relay) {
            return {};
        }
        return {
            6: {
                50: 14262
            }
        };
    }

    if (!turnRelayOn) {
        if (!state.relay) {
            return {};
        }
        return {
            6: {
                50: 14263
            }
        };
    }

    return {};
}

function calcIonzMods(state) {
    const currentDay = new Date().getDay();
    const currentDayMin = new Date().getMinutes() + (new Date().getHours() * 60);

    let turnRelayOn = false;
    for (const event of state.events) {
        if (currentDay === event.day && currentDayMin >= event.timeStartMin && currentDayMin <= event.timeStartMin + event.durationMin) {
            turnRelayOn = true;
        }
    }

    if (turnRelayOn) {
        if (state.relay) {
            return {};
        }
        return {
            7: {
                50: 14262
            }
        };
    }

    if (!turnRelayOn) {
        if (!state.relay) {
            return {};
        }
        return {
            7: {
                50: 14263
            }
        };
    }

    return {};
}

// change regs ---------------------------------------------------------------------

async function changeRegs(modifyRegs) {
    for (const [section, devices] of Object.entries(modifyRegs)) {
        for (const [deviceId, addresses] of Object.entries(devices)) {
            for (const [address, value] of Object.entries(addresses)) {
                const writeReq = makeWriteTCPRequest(deviceId, address, value);
                console.log(writeReq, deviceId);
                const tcpRes = await reuestToApi(writeReq, deviceId);
                console.log(tcpRes);
            }
        }
    }

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
        return formatTcpRequest(data, 0);
    }
    return formatRtuRequest(data);
}

function makeWriteTCPRequest(deviceId, address, value) {
    const data = [
        Number(deviceId),
        Number("0x06"),
        ...numberToHiLowBytes(Number(address)),
        ...numberToHiLowBytes(value)];
    if (deviceId === 111) {
        return formatTcpRequest(data, 0);
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
    const crc16Arr = numberToHex16(getCrc16(data)).split(":");
    const res = `${data.map(numberToHex8).join("")}${crc16Arr[1]}${crc16Arr[0]}`;
    return res;
}

function getCrc16(data) {
    let crc = 0xffff;
    for (let b of data) {
        for (let i = 0; i < 8; i++) {
            const first8b = crc & 0xff;
            crc = (b ^ first8b) & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
            b >>= 1;
        }
    }
    return crc;
}

function numberToHiLowBytes(value) {
    return [(value >> 8) & 0xff, value & 0xff];
}

function numberToHex16(value) {
    return `${numberToHex8(value >> 8)}:${numberToHex8(value & 255)}`;
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