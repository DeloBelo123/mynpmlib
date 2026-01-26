type ruleFn = (input:any) => boolean
/**
 * WICHTIG: die "Rules" folgen dem (BASE-REGEL) OR (AUSNAHMEN) prinzip, also eher policy + ausnahme anstatt "strenge boolsche Logik",
 * hier in so einer Form:(root && and1 && and2 && ...) || (or1 || or2 || ...), also wenn auch nur ein .or() rule true ergibt, ist die
 * gesammte rule bei .allows(input) true.
 * @example
 * interface User {
    name:string, 
    age:number,
    email:`${string}@${string}.${string}`
    is_admin:boolean
    has_payed:boolean
    tier: "free" | "pro" | "enterprise"
}

const user:User = {
    name: "John Doe",
    age: 20,
    email: "john.doe@example.com",
    is_admin: false,
    has_payed: false,
    tier: "free"
}

 * const rule = Rule
    .from(user => user.age > 18)
    .and(user => !user.is_admin)
    .and(user => user.has_payed)
    .or(Rule.from(user => user.tier === "free")
        .and(user => !user.has_payed)
        .and(user => user.age === 21))
    .or(Rule.from(user => user.name === "John Doe")
        .and(user => user.age === 20)
        .and(user => user.email === "john.doe@example.com"))

    console.log(rule.allows(user)) // returned true
 */
export class Rule {
    private root:ruleFn
    private and_rules:ruleFn[] = []
    private or_rules:Rule[] = []
    
    private constructor(root:(input:any) => boolean){
        this.root = root
    }
    public static from(root:(input:any) => boolean){
        return new Rule(root)
    }
    public and(fn:(input:any) => boolean){
        this.and_rules.push(fn)
        return this
    }
    public or(rule:Rule){
        this.or_rules.push(rule)
        return this
    }
    public allows(input:any):boolean{
        let result;
        result = this.root(input)

        for(const and_rule of this.and_rules){
            if(!and_rule(input)) {
                result = false
                break
            }
        }

        for(const or_rule of this.or_rules){
            if(or_rule.allows(input)) {
                result = true
                break
            }
        }
        return result
    }
}

//test

interface User {
    name:string, 
    age:number,
    email:`${string}@${string}.${string}`
    is_admin:boolean
    has_payed:boolean
    tier: "free" | "pro" | "enterprise"
}

const user:User = {
    name: "John Doe",
    age: 20,
    email: "john.doe@example.com",
    is_admin: false,
    has_payed: false,
    tier: "free"
}

const rule = Rule
    .from(user => user.age > 18)
    .and(user => !user.is_admin)
    .and(user => user.has_payed)
    .or(Rule.from(user => user.tier === "free")
        .and(user => !user.has_payed)
        .and(user => user.age === 21))
    .or(Rule.from(user => user.name === "John Doe")
        .and(user => user.age === 20)
        .and(user => user.email === "john.doe@example.com"))

console.log(rule.allows(user))