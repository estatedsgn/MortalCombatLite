/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Heros;

/**
 *
 * @author nyaku
 */
public class Enemy extends Hero{

    private String name;

    public Enemy(String name, int level, int maxhealth, int damage) {
        super(level, maxhealth, damage);
        this.name = name;
    }

    @Override
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

}
