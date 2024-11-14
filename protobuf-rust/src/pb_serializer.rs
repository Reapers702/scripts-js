use core::panic;
use serde_json;

pub struct ProtoSerializer {
    data: serde_json::Value,
}

impl ProtoSerializer {

    pub fn new(data: serde_json::Value) -> ProtoSerializer {
        ProtoSerializer {data}
    }

    pub fn serialize(&self) -> Vec<u8> {
        self.encode_obj(&self.data)
    }
    
    fn encode_obj(&self, data: &serde_json::Value) -> Vec<u8> {
        if !data.is_object() {
            panic!("not an object value");
        }

        let mut result = Vec::new();

        let json_obj = data.as_object().unwrap();
        for key in json_obj.keys() {
            let parts = key.split("/").collect::<Vec<&str>>();
            let (wire_type_name, index) = (parts[0], parts[1].parse::<i32>().unwrap());

            match wire_type_name {
                "int32" => {
                    let val = json_obj.get(key).unwrap().as_i64().unwrap();
                    let mut bytes = self.encode_int32(val as i32);
                    result.append(&mut self.encode_meta(index, 0));
                    result.append(&mut bytes);
                }
                "int64" => {
                    let val = json_obj.get(key).unwrap().as_i64().unwrap();
                    let mut bytes = self.encode_int64(val);
                    result.append(&mut self.encode_meta(index, 0));
                    result.append(&mut bytes);
                },
                "float" => {
                    let val = json_obj.get(key).unwrap().as_f64().unwrap();
                    let mut bytes = self.encode_float(val as f32);
                    result.append(&mut self.encode_meta(index, 5));
                    result.append(&mut bytes);
                },
                "double" => {
                    let val = json_obj.get(key).unwrap().as_f64().unwrap();
                    let mut bytes = self.encode_double(val);
                    result.append(&mut self.encode_meta(index, 1));
                    result.append(&mut bytes);
                },
                "string" => {
                    let val = json_obj.get(key).unwrap().as_str().unwrap();
                    let mut bytes = self.encode_string(val);
                    result.append(&mut self.encode_meta(index, 2));
                    result.append(&mut self.encode_positive_varint(bytes.len() as isize));
                    result.append(&mut bytes);
                },
                "object" => {
                    let val = json_obj.get(key).unwrap();
                    let mut bytes = self.encode_obj(val);
                    result.append(&mut self.encode_meta(index, 2));
                    result.append(&mut self.encode_positive_varint(bytes.len() as isize));
                    result.append(&mut bytes);
                },
                _ => {
                    panic!("unknown wire type {}", wire_type_name);
                }
            };
        };

        result
    }

    fn encode_meta(&self, index: i32, wire_type: i32) -> Vec<u8> {
        if [0, 1, 2, 5].contains(&wire_type) {
            panic!("unknown wire type {}", wire_type);
        }
        
        if index <= 0b1111 {
            return [(wire_type << 5) as u8 | (index as u8)].to_vec();
        }

        
        Vec::new()
    }
    
    fn encode_positive_varint(&self, num: isize) -> Vec<u8> {
        if num < 0 {
            panic!("negative varint {}", num);
        }
        
        Vec::new()
    }

    fn encode_int32(&self, num: i32) -> Vec<u8> {
        Vec::new()
    }

    fn encode_int64(&self, num: i64) -> Vec<u8> {
        Vec::new()
    }
    
    fn encode_float(&self, num: f32) -> Vec<u8> {
        Vec::new()
    }
    
    fn encode_double(&self, num: f64) -> Vec<u8> {
        Vec::new()
    }

    fn encode_string(&self, val: &str) -> Vec<u8> {
        Vec::new()
    }

    
}


#[cfg(test)]
use base64::{prelude, Engine};

#[test]
fn test_serialize() {
    let base64_data = "";
    let correct_answer = prelude::BASE64_STANDARD.decode(base64_data).unwrap();
    
    let json_data = "{}";
    let result = serde_json::from_str::<serde_json::Value>(json_data).unwrap();

    let serializer = ProtoSerializer::new(result);
    let bytes = serializer.serialize();

    assert!(bytes.eq(&correct_answer));
}