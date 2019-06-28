# try-o-rama

The first Holochain *test orchestrator*. 

"[diorama](https://github.com/holochain/diorama)"++ === "triorama", but "try-o-rama" is catchier ;)

## Basic usage

```js
const {Tryorama} = require('@holochain/try-o-rama')
const dnaBlog = Tryorama.dna('path/to/blog.dna.json', 'blog')
const dnaComments = Tryorama.dna('path/to/comments.dna.json', 'comments')

const tryorama = new Tryorama({
  instances: {
    aliceBlog: dnaBlog,
    aliceComments: dnaComments,
    bobBlog: dnaBlog,
    bobComments: dnaComments
  },
  bridges: [
    Tryorama.bridge('handle', aliceBlog, aliceComments),
    Tryorama.bridge('handle', bobBlog, bobComments),
  ]
})

tryorama.registerScenario('a test', async (s, {aliceBlog, bobBlog}) => {
    await aliceBlog.call('blog', 'create_post', {
        content: 'holo wurld'
    })
    await s.consistent()
    const posts = await bobBlog.call('blog', 'list_posts')
    // write some assertions
})

tryorama.run()

```

## Stay tuned

Much more documention to come!