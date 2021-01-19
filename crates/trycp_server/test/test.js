var WebSocket = require('rpc-websockets').Client
var msgpack = require('@msgpack/msgpack')


process.on('unhandledRejection', error => {
    console.error('got unhandledRejection:', error);
});

doTest("ws://localhost:9000")
//doTest("wss://test1-eu-central-1.holochain-aws.org")
//magic_remote_machine_manager("3000")
function magic_remote_machine_manager(port) {
    const { spawn } = require('child_process');
    const trycp = spawn('trycp_server', ['-p', port]);
    trycp.stdout.on('data', (data) => {
        var regex = new RegExp("waiting for connections on port "+port);
        if (regex.test(data)){
            doTest("ws://localhost:"+port)
        }
        console.log(`stdout: ${data}`);
    });
    trycp.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });
}

// instantiate Client and connect to an RPC server
function doTest(url) {
    return new Promise( (resolve) => {
    console.log("starting up at ",url)
    var ws = new WebSocket(url)
    ws.on('open', async function() {
        console.log("making ping call")
        // call an RPC method with parameters

        await ws.call('ping').then(function(result) {
             console.log(result)
        })

        console.log("calling download_dna")
        await ws.call('download_dna', {"url": "https://github.com/holochain/passthrough-dna/releases/download/v0.0.6/passthrough-dna.dna.json"}).then(function(result) {
            console.log(result)
        })

        console.log("calling download_dna again to test caching")
        await ws.call('download_dna', {"url": "https://github.com/holochain/passthrough-dna/releases/download/v0.0.6/passthrough-dna.dna.json"}).then(function(result) {
            console.log(result)
        })

        const config =
`signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network: ~`;
        console.log("making configure_player call")
        let result = await ws.call('configure_player', {"id": "my-player", "partial_config": config})
        console.log(result)

        console.log("making configure_player call")
        result = await ws.call('configure_player', {"id": "my-player2", "partial_config": config})
        console.log(result)

        console.log("making startup call")
        result = await ws.call('startup', {"id": "my-player"})
        console.log(result)

        console.log("making admin_interface_call call")
        result = await ws.call('admin_interface_call', {"id" : "my-player", "message_base64": Buffer.from(msgpack.encode({"type": "generate_agent_pub_key"})).toString("base64")})
        console.log(msgpack.decode(Buffer.from(result, "base64")))

        console.log("making shutdown call")
        result = await ws.call('shutdown', {"id": "my-player", "signal": "SIGTERM"})
        console.log(result)

        console.log("making startup call2")
        result = await ws.call('startup', {"id": "my-player"})
        console.log(result)

        console.log("making reset call")
        result = await ws.call('reset')
        console.log(result)

        console.log("making player2 call with config")
        result = await ws.call('configure_player', {"id": "my-player", "partial_config": config})
        console.log(result)

        // close a websocket connection
        ws.close()

        resolve()
    })
    })
}

// doTestManager("ws://localhost:9000")  // uncomment to manually run manager test
// instantiate Client and connect to an RPC server
function doTestManager(url) {
    return new Promise( (resolve) => {
        console.log("starting up at ",url)
        var ws = new WebSocket(url)
        ws.on('open', async function() {
            console.log("making register call, expect: 'registered'")
            // call an RPC method with parameters
            await ws.call('register', {"url": "ws://localhost:9001", "ram": 10}).then(function(result) {
                console.log(result)
            })

            console.log("making request call, expect: insufficient endpoints available")
            // call an RPC method with parameters
            await ws.call('request', {"count": 100}).then(function(result) {
                console.log(result.error)
            })

            console.log("making request call, expect: registered node")
            // call an RPC method with parameters
            await ws.call('request', {"count": 1}).then(function(result) {
                console.log(result)
            })

            console.log("making request call, expect: insufficient endpoints available")
            // call an RPC method with parameters
            await ws.call('request', {"count": 1}).then(function(result) {
                console.log(result.error)
            })

            // close a websocket connection
            ws.close()

            resolve()
        })
    })
}
