import { createServer } from 'node:http'
createServer((req, res) => {
  let b = ''
  req.on('data', c => (b += c))
  req.on('end', () => {
    console.log('[mock] quest request received')
    const pool = {
      daily: ['MOCK Run 3km easy', 'MOCK Do 10 min mobility', 'MOCK Rest day, log how legs feel',
              'MOCK 8x20s strides', 'MOCK Foam roll 10 min'],
      weekly: ['MOCK Run 3 times this week', 'MOCK Add 1km to long run', 'MOCK One tempo run'],
      monthly: ['MOCK 15km long run', 'MOCK 40km week', 'MOCK Get fitted for shoes'],
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id:'m', type:'message', role:'assistant', model:'claude-opus-5',
      stop_reason:'end_turn', content:[{type:'text',text:JSON.stringify(pool)}],
      usage:{input_tokens:10,output_tokens:10} }))
  })
}).listen(5198, () => console.log('mock ready'))
