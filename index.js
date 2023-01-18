// let turnCompsOnDate = ;
// let turnCompsOffDate = ;

function run() {
    console.log("run");

    const state = getStateFromRegisters();

    const modifyRegs = calcModifications(state);

    // write to regs
    changeRegs(modifyRegs);
}

function getStateFromRegisters() {
    const regs = readRegisters();
    // {
    //     [deviceId]: {
    //         [address]: ""
    //     }
    // }
    // { comps: {}, ozon: {}, ionz: {} }
    return composeState(regs);
}

function calcModifications(state) {
    const mods = {};
    mods.comps = calcCompsMods(state.comps);
    mods.ozon = calcOzonMods(state.ozon);
    mods.ionz = calcIonzMods(state.ionz);
    return mods;
}

setInterval(run, 5000);