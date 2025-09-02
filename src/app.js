import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils, EVENTS } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from 'aurik3-provider-baileys'
import { cp, stat } from 'fs'
import { stringify } from 'querystring'
import { get } from 'http'
import { text } from 'stream/consumers'
import { error } from 'console'

// import { NOMEM } from 'dns' // No lo necesitas, se puede quitar

const PORT = process.env.PORT ?? 3008

const discordFlow = addKeyword('doc').addAnswer(
    ['You can see the documentation here', '📄 https://builderbot.app/docs \n', 'Do you want to continue? *yes*'].join(
        '\n'
    ),
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
        if (ctx.body.toLocaleLowerCase().includes('yes')) {
            return gotoFlow(registerFlow)
        }
        await flowDynamic('Thanks!')
        return
    }
)

const wwelcomeFlow = addKeyword(['hi', 'hello', 'bien'])
    .addAnswer(`🙌 Hello welcome to this *Chatbot*`)
    .addAnswer(
        [
            'I share with you the following links of interest about the project',
            '👉 *doc* to view the documentation',
        ].join('\n'),
        { delay: 800, capture: true },
        async (ctx, { fallBack }) => {
            if (!ctx.body.toLocaleLowerCase().includes('doc')) {
                return fallBack('You should type *doc*')
            }
            return
        },
        [discordFlow]
    )

const registerFlow = addKeyword(utils.setEvent('REGISTER_FLOW'))
    .addAnswer(`What is your name?`, { capture: true }, async (ctx, { state }) => {
        await state.update({ name: ctx.body })
    })
    .addAnswer('What is your age?', { capture: true }, async (ctx, { state }) => {
        await state.update({ age: ctx.body })
    })
    .addAction(async (_, { flowDynamic, state }) => {
        await flowDynamic(`${state.get('name')}, thanks for your information!: Your age: ${state.get('age')}`)
    })

const fullSamplesFlow = addKeyword(['samples', utils.setEvent('SAMPLES')])
    .addAnswer(`💪 I'll send you a lot files...`)
    .addAnswer(`Send image from Local`, { media: join(process.cwd(), 'assets', 'sample.png') })
    .addAnswer(`Send video from URL`, {
        media: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LCohAb657pSdHv0Q5h/giphy.mp4',
    })
    .addAnswer(`Send audio from URL`, { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
    .addAnswer(`Send file from URL`, {
        media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    })
const pdfFlow = addKeyword('pdf')
    .addAnswer('Ya te envìo el PDF', { media: join(process.cwd() , 'assets', 'reg.pdf') })

const welcomeFlow = addKeyword(EVENTS.WELCOME)
.addAnswer('Hola!!, Si quieres hacer tu pedido por este medio, realiza tu pedido completo accediendo al ícono de la tienda ☝️🛒 mostrado en la parte superior derecha, recuerda agregar todos tus platillos, extras y bebidas *en una sola orden*.\n Una vez elegidos tus productos continuaremos a tomarte los datos. \n\n Si quieres comunicarte con el personal para realizar tu pedido directo a la sucursal te dejo los números de contacto 👇📞: \n📍*ITESO:* 3332713483 \n📍*TESORO:* 3323171186')


const deliverOrRest = addKeyword(utils.setEvent('deliverOrRest'))
    .addAnswer('Primero que todo necesito saber si tu pedido es a domicilio o pasarás a recoger el pedido UNICAMENTE (*DOMICILIO o RECOGER*)',
        {capture: true},
        async (ctx, {state, fallBack, gotoFlow}) => { 
            //obtenemos el JSON actual del pedido
            const currentOrder = state.get('order')
            const clientAnswer = ctx.body.toLocaleLowerCase()
            if (clientAnswer !== 'domicilio' && clientAnswer !== 'recoger')
                return fallBack(`${ctx.name}\n\n Por favor escribe unicamente *DOMICILIO* o *RECOGER*`)
            const updatedOrder = {
                ...currentOrder,
                deliverOrRest: clientAnswer
            }
            //actualizamos el JSON del pedido
            await state.update({order: updatedOrder})
            if (clientAnswer == 'domicilio'){

                return gotoFlow(getAddress)
            }
            else if (clientAnswer == 'recoger'){
                return gotoFlow(getSucursal)
            }
        }
    )

const getAddress = addKeyword(utils.setEvent('getAddress'))
    .addAnswer('Muy bien ahora, necesito tu codigo postal por favor', {capture: true}, async (ctx, {state, fallBack, flowDynamic, endFlow})=>{
        const validItesoCP = {'45609': '', '45604': '', '45235': '', '45601': ''}
        const validTesoroCP = {'45606': '','45608': '', '45080': '', '45085': ''}
        const clientAnswer = ctx.body.trim()
        const currentOrder = state.get('order')
        const isNumber = /^[0-9]{5}$/.test(clientAnswer)
        if (!isNumber){
            return fallBack('Unicamente puedes contestar con numeros')
        }
        if (clientAnswer in validItesoCP){
            const updatedOrder = {
                ...currentOrder,
                sucursal: 'ITESO'
            }
            await state.update({order: updatedOrder})
            //creamos un objeto global con el codigo postal para despues acceder a el
            const clientCP = state.get('cp')
            await state.update({cp: clientAnswer})
        } else if (clientAnswer in validTesoroCP) {
            const updatedOrder = {
                ...currentOrder,
                sucursal: 'TESORO'
            }
            await state.update({order: updatedOrder})
            //creamos un objeto global con el codigo postal para despues acceder a el
            const clientCP = state.get('cp')
            await state.update({cp: clientAnswer})
        } else {
            await handleCloudService(ctx.from, 'remove')
            return endFlow('Lo sentimos, por el momento no tenemos servicio a domicilio en tu zona.\n\n Tenemos la opción de recoger en sucursal, si deseas recoger el pedido por favor realiza de nuevo tu orden.\n\n También contamos con todo nuestro menú en *Uber Eats y Rappi*')
        }
    })
    .addAnswer('Ahora describeme tu dirección completa, incluyendo calle, número, colonia y ciudad. Por favor, sé lo más específico posible.',
        {capture: true},
        async (ctx, {state, gotoFlow, fallBack}) => {
            const clientAnswer = ctx.body.trim()
            //vamos a actualizar la orden con la dirección del cliente
            const currentOrder = state.get('order')
            const clientCP = state.get('cp')
            if (clientAnswer.length < 10){
                return fallBack(`${ctx.name}, por favor escribe una dirección completa y detallada.`)
            }
            const updatedOrder = {
                ...currentOrder,
                address: `${clientAnswer}, ${clientCP}`
            }
            await state.update({order: updatedOrder})
        })
    .addAnswer('Proporcioname *referencias de tu domicilio* que puedan ayudar al repartidor a encontrarte más fácil :D. \n\n*Sé muy específico por favor!!*',
               {capture: true}, 
              async (ctx, {state, gotoFlow, fallBack}) => {
                  //vamos a actualizar la orden con las referencias del domicilio del cliente 
                  const currentOrder = state.get('order')
                  const clientAnswer = ctx.body.trim()
                  if (clientAnswer.length < 10 ){
                      return fallBack(`${ctx.name}, por favor escribe la referencia de tu domicilio completa y detalladamente. Sé específico por favor`)
                  }
                  const updatedOrder = {
                      ...currentOrder,
                      referencia: clientAnswer
                  }
                  await state.update({order: updatedOrder})
                  return gotoFlow(payMethod)
              })

const payMethod = addKeyword(utils.setEvent('payMethod'))
        .addAnswer('¿Cuál será tu método de pago? (Efectivo o tarjeta)', {capture: true}, async (ctx, {state, flowDynamic, fallBack, gotoFlow})=>{
            const currentOrder = state.get('order')
            const validPayMethods = {'efectivo': '', 'tarjeta': ''}
            const clientAnswer = ctx.body.toLocaleLowerCase()
            if (!(clientAnswer in validPayMethods)){
                return fallBack(`${ctx.name}, por favor escribe unicamente *efectivo* o *tarjeta*`)
            } else {
                const updatedOrder = {
                    ...currentOrder,
                    payMethod: clientAnswer
                }
                state.update({order: updatedOrder})
                return gotoFlow(especPedidoFlow)
            }
        })

const getSucursal = addKeyword(utils.setEvent('getSucursal'))
    .addAnswer(
        'Perfecto, tu pedido fue capturado, ahora necesito saber a que sucursal iría tu pedido  UNICAMENTE: (*ITESO o TESORO*)',
        {capture:  true},
        async (ctx, {state, fallBack}) => {
            // vamos a obtener la orden actual con state
            const currentOrder = state.get('order')
            // validamos antes de acutaliar los datos
            if (ctx.body.toLocaleLowerCase() !== 'iteso' && ctx.body.toLocaleLowerCase() !== 'tesoro') {
                return fallBack('Por favor, escribe *ITESO* o *TESORO* unicamente.')
            }
            // una vez validado actualizamos la orden
            const updatedOrder = {
                ...currentOrder,
                sucursal: ctx.body.toLocaleUpperCase()
            }
            // guardamos la nueva orden con state
            await state.update({order: updatedOrder})
            //return gotoFlow(especPedidoFlow)
        }
    )
    .addAnswer('Ahora por favor especifica el nombre de la persona que pasa por el pedido', {capture: true}, async (ctx, {state, gotoFlow, fallBack})=> {
        const clientAnswer = ctx.body
        // validamos que el nombre sea valido
        const isValidName = clientAnswer.trim().length > 3 ? true : false
        const includeNumbers = /^[a-zA-Z\s]+$/.test(clientAnswer) ? true : false
        if (!isValidName || !includeNumbers){
            return fallBack(`${ctx.name}, por favor escribe un nombre valido, *no debe tener ni numeros ni caracteres especiales (comas, acentos, etc..)*`)
        } else{
            const currentOrder = state.get('order')
            const updatedOrder = {
                ...currentOrder,
                deliverTo: clientAnswer
            }
            state.update({order: updatedOrder})
            return gotoFlow(especPedidoFlow)
        }

    })

const especPedidoFlow = addKeyword(utils.setEvent('ESPEC_PEDIDO'))
    .addAnswer(
        'Perfecto, ahora es momento de especificar tus *servicios*, *comentarios de los platillos* y/o *alergias*. Se especifico por favor !! \n En caso de no tener escribir "*ninguno*".',
        { capture: true },
        async (ctx, { state }) => {
            // Obtenemos la orden actual del estado

            if (ctx.body.toLocaleLowerCase() === 'ninguno'){
                ctx.body = ''
                const ninguno = true
            }

            //obtenemos la orden actual 
            const currentOrder = state.get('order');
            
            // Actualizamos la orden con las especificaciones
            const updatedOrder = {
                ...currentOrder,
                specs: ctx.body
            };
            // Guardamos la orden actualizada en el estado
            await state.update({ order: updatedOrder });

            if (ctx.body.toLocaleLowerCase() != 'ninguno'){
                console.log('Especificaciones guardadas:', ctx.body);
            }
        }
    )
    .addAction(async (ctx, {state, flowDynamic}) => {
        const order = state.get('order')
        const deliverOrRest = order.deliverOrRest === 'domicilio' ? `🏢 Domicilio: ${order.address} \nReferencia: ${order.referencia} \n\n 💵 Pago con: ${order.payMethod.charAt(0).toUpperCase() + order.payMethod.slice(1)}` : `🏢 Sucursal: ${order.sucursal} \n\n👤 El pedido se entregará a: ${order.deliverTo}`
        const specs = order.specs === '' ? '' : `\n\n📋 Especificaciones: ${order.specs}`
        flowDynamic(`Muy bien ${ctx.name} vamos a confirmar tu orden:
                \n🧾 ID: *${order.orderId}*
                \n🍣 Detalle: ${order.productDetails.clientFormat}
                \n💵 Total: *$${order.total} ${order.currency}*
                \n${deliverOrRest}
                ${specs}
            `)
    })
    .addAnswer('Por favor confirma que los datos son correctos escribiendo *confirmar* o *cancelar* para cancelar la orden.',
        {delay: 1500, capture: true },
        async (ctx, {gotoFlow, fallBack}) => {
            if (ctx.body.toLocaleLowerCase() != 'confirmar' && ctx.body.toLocaleLowerCase() != 'cancelar') {
                return fallBack('Por favor escribe *confirmar* o *cancelar*')
            }
            else if (ctx.body.toLocaleLowerCase() === 'confirmar'){
                return gotoFlow(confirmOrder)
            }
            else if (ctx.body.toLocaleLowerCase() === 'cancelar'){
            }
        }
)

const confirmOrder = addKeyword(utils.setEvent('CONFIRM_ORDER'))
    .addAction(async (ctx, {state, flowDynamic, provider}) => {
        const order = state.get ('order')
        const newOrder = {
            ...order,
            productDetails: JSON.stringify(order.productDetails.apiFormat)
        }
        await senOrderAPI(newOrder)
        await flowDynamic(`Gracias por tu compra 🍣🥢: ${ctx.name} tu orden fue enviada correctamente.\nTe recordamos el id de tu orden: *${newOrder.orderId}* 🍱`)
        // ahora si el cliente escoge transferencia se manda un mensaje al dueño para que verifique la transferencia
        if (newOrder.payMethod === 'transferencia'){
            await provider.vendor.sendMessage(
                '5213326232840@s.whatsapp.net',
                {text: `Hola Equipo Soru, revisa la transferencia de: \n*${newOrder.name}* - ${newOrder.numero}\n\n🧾 ID de la orden: *${newOrder.orderId}* \n💵 Total de la cuenta: $${newOrder.total} ${newOrder.currency}`}
            )
        }
    })
    .addAction(async (ctx) => {
        await handleCloudService(ctx.from, 'remove')
    })

const cancelOrder = addKeyword(utils.setEvent('CANCEL_ORDER'))
    .addAnswer('Tu orden ha sido cancelada. Si deseas realizar un nuevo pedido, por favor accede a nuestro catalogo y haz el pedido de nuevo. Buen dìa :D')
    .addAction(async (ctx) => {
        await handleCloudService(ctx.from, 'remove')
    })

const orderFlow = addKeyword(EVENTS.ORDER)
.addAnswer('se activo el flujo de orden')
.addAction(async (ctx) => {
    console.log('va a mandar blacklisttt')
    console.log(`numero a blacklisttttt: ${ctx.from}`)
    await handleCloudService(ctx.from, 'add')
})
.addAction(async (ctx,  {flowDynamic, provider, gotoFlow, state}) => {
    const orderId = ctx.message.orderMessage.orderId
    const orderToken = ctx.message.orderMessage.token
    const name = ctx.name
    const numero = ctx.from
    console.log(`ctx: ${JSON.stringify(ctx, null, 2)}`)
    console.log(`orderId: ${orderId}, orderToken: ${orderToken}`)
    //vamos a obtener cualquier posible error de provider
    let orderDetails;
    try {
        orderDetails = await provider.vendor.getOrderDetails(orderId, orderToken);
        console.log(`Detalles de la orden: ${JSON.stringify(orderDetails, null, 2)}`);
    } catch (err) {
        console.error("❌ Error en getOrderDetails:", err);
        return flowDynamic("No pudimos obtener los detalles de tu pedido. Por favor intenta más tarde.");
    }
        const productDetails = getProducts(orderDetails);
    /*await flowDynamic(`Hola ${ctx.name}, tu orden ha sido recibida y está siendo procesada.
                        \n🧾 ID: *${orderId}*
                        \n🍣 Detalle: ${productDetails.clientFormat}
                        \n💵 Total: $${orderDetails.price.total / 1000} ${orderDetails.price.currency}
                        \nGracias por tu compra!`)*/
    const order = {
        action: 'nuevoPedido',
        restaurante: 'Soru',
        orderId,
        orderToken,
        deliverOrRest,
        name,
        numero,
        sucursal : '',
        deliverTo: '',
        address: '',
        referencia: '',
        productDetails,
        total: orderDetails.price.total / 1000,
        currency: orderDetails.price.currency,
        specs: '',
    }
    await state.update({ order }) // Guardamos el objeto order en el estado
    console.log('vamos a ir al flujo deliverOrRest')
    return gotoFlow(deliverOrRest) // Aquí pasamos el objeto order al flujo especPedidoFlow
    // Si necesitas acceder a `order` en especPedidoFlow, asegúrate de que
    // el flujo pueda recibirlo correctamente, por ejemplo, usando `state` o `ctx`.
    // Si especPedidoFlow necesita acceder a `order`, puedes usar `state.update({ order })` en especPedidoFlow
    // o asegurarte de que el flujo pueda recibirlo como un parámetro.
})

const testFlow = addKeyword('juan')
    .addAnswer('entro al juan flow')
    .addAnswer('van a pasar 3 segundos')
    .addAnswer('ya han pasado 3 segundos', {delay: 3000})
    .addAction({ capture: true }, async (ctx, { flowDynamic, fallBack }) => {
    await flowDynamic(`${ctx.from} es tu número??:`);
        if (ctx.body.toLocaleLowerCase() !== 'si') {
            return fallBack('Tienes que escribir estrictamente *si*');
        }

        // Si la respuesta es 'si'
        await flowDynamic(`¡Perfecto ${ctx.name} !!! \n\n Tu número es: *${ctx.from}*`);
    });

const getProducts = (orderDetails) => {
        // Creamos el detalle de productos mapeando el array para el cliente 
        const clientFormat = orderDetails.products.map(product => 
            `🛒\n- ${product.quantity}x ${product.name} → $${(product.price/1000) * product.quantity} ${product.currency}`
        ).join('');

        const apiFormat = orderDetails.products.map( product => ({
            name: product.name,
            quantity: product.quantity,
            total: (product.price / 1000 * product.quantity),
            currency: product.currency
        })
        )

        return {
            clientFormat, 
            apiFormat
        }

}


const sendOrder = async (order) => {
    try {
        const response = await fetch ('https://webhook.site/72d80adf-9d19-4645-a2d0-b9e3d3448941', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(order)
        })

        if (!response.ok){
            throw new Error(`Error al enviar la orden: ${response.statusText}`);
        } else if (response.ok){
            console.log(`orden enviada correctamente: ${response.statusText}`)
            await senOrderAPI(order)
        }
    } catch (error) {
        console.error(`Error al hacer la PETICION ${error}`)
    }
}

const senOrderAPI = async (order) => {
    try{
        const response = await fetch ('https://script.google.com/macros/s/AKfycbzhwNTB1cK11Y3Wm7uiuVrzNmu1HD1IlDTPlAJ37oUDgPIabCWbZqMZr-86mnUDK_JPBA/exec', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(order)
        })
        if (!response.ok){
            console.error(`Error al enviar al script\n------------------\n ${response.statusText})`)
        } else if (response.ok){
            console.log(`RESPONSE DEL SCRIPT: ${JSON.stringify(response, null, 2)}`)
            console.log(`Orden enviada al script correctamente: ${response.statusText}`)
            console.log(`Orden enviada: ${JSON.stringify(order, null, 2)}`)
        }
    }catch (error){
        console.error(`Error al hacer la PETICION al GScript ${error}`)
    }
}

const handleCloudService = async(number, intent) => {
    try {
        console.log(`se esta queriendo ${intent} a: ${number} `)
        const response = await fetch ('https://app.builderbot.cloud/api/v2/86d04d0d-259a-4db4-9ffb-b159f19d454d/blacklist', {
            method: 'POST',
            headers: {
                'Content-type': 'application/json',
                'x-api-builderbot': 'bb-0238720b-41a0-4e70-9126-eb3f5b6c8a1c' 
            },
            body: JSON.stringify({  
                number: number,
                intent : intent
            })
        })

        if (!response.ok){
            throw new Error(`ERROR AL HACER LA PETICION AL BLACKLIST, detalles: ${response.statusText}`)
        } else if (response.ok) console.log(`Blaclist: ${number} : ${intent} con èxito`)
    } catch (error) {
        console.error(`ERROR AL HACER LA PETICION, DETALLES: ${error}`)
    }
}

const main = async () => {
    // Asegúrate que especPedidoFlow y genFlow estén en la lista
    const adapterFlow = createFlow([welcomeFlow, orderFlow, especPedidoFlow, cancelOrder, confirmOrder, testFlow, deliverOrRest, getAddress, getSucursal, payMethod])
    const adapterProvider = createProvider(Provider)
    const adapterDB = new Database()

    const resultado = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    console.log('Propiedades disponibles de createBot:', Object.keys(resultado))

    // botInstance es la instancia principal del bot
    const botInstance = resultado;
    // Desestructuramos para acceso directo a handleCtx y httpServer, etc.
    const { handleCtx, httpServer, handleMsg } = botInstance;

    /*adapterProvider.on('message', async (ctx) => {
        const number = `${ctx.from}@s.whatsapp.net`
        if (ctx.message && ctx.message.orderMessage) {
            console.log(`numero: ${ctx.from}`)
            try {
                // Obtienes el objeto de helpers (incluido gotoFlow) de handleMsg
                const { gotoFlow } = await handleMsg(ctx);
                console.log(`gotoFlow: ${gotoFlow}`);
                console.log(`ctx: ${JSON.stringify(ctx, null, 2)}`);
                console.log("vamos a intentar ir al especPedidoFlow usando gotoFlow");

                // *** USANDO especPedidoFlow DIRECTAMENTE ***
                await gotoFlow(especPedidoFlow); // <-- ¡Pasas la referencia directa al flujo!

                console.log("gotoFlow a especPedidoFlow intentado (debería funcionar ahora)");

            } catch (error) {
                console.error('Error al procesar la orden:', error);
            }
        }
    });*/

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    httpServer(+PORT)
}

main()
