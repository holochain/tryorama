

import {delay} from './util'

export class ScenarioApi {
  consistent = (instances?) => {
    console.log("................................")
    console.log(". delaying 3 seconds as a hack .")
    console.log("................................")
    const promise = delay(3000)
    console.log("Done waiting! (TODO hook up waiter)")
    return promise
  }
}
