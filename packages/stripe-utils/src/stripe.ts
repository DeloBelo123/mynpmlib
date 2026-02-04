import { Product } from "./types"

function getProductByName(products:Record<string,Product>,name:string):Product | undefined{
    for(const product in products){
        if(products[product].name == name){
            return products[product]
        }
    }
}
function getProductByPriceId(products:Record<string,Product>,priceId:string):Product | undefined{
    for(const product in products){
        if(products[product].priceId == priceId){
            return products[product]
        }
    }
}
function getProductByDescription(products:Record<string,Product>,description:string):Product | undefined{
    for(const product in products){
        if(products[product].description == description){
            return products[product]
        }
    }
}

/**
 * retured das Produkt anhand des Identifiers
 * @param products deine Stripe Produkte
 * @param identifier entweder der Name, die PriceId oder die Beschreibung des Produktes (je nach dem welche value du grad hast)
 * @returns das Produkt
 * @throws Error wenn das Produkt nicht gefunden wurde
 */
export function getProduct(products:Record<string,Product>,identifier:string):Product{
    const byName = getProductByName(products, identifier)
    if (byName) return byName

    const byPrice = getProductByPriceId(products, identifier)
    if (byPrice) return byPrice

    const byDescription = getProductByDescription(products, identifier)
    if (byDescription) return byDescription

    throw new Error(`Product with identifier ${identifier} not found`)
}